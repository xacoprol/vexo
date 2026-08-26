import {
  carryFromPresented303,
  parsePurchaseVatKind,
  presented303CarryToPriorCompensation,
  type Model303TraceLine,
} from "@/lib/modelo-303";
import { moneyEqual } from "@/lib/modelo-390/money";
import { aggregateIrpfIncome } from "@/lib/modelo-130/irpf-income";
import {
  INVOICE_FISCAL_TYPE,
  RECTIFICATION_METHOD,
} from "@/lib/invoice-rectification";
import { isInvoiceIssued } from "@/lib/invoice-fiscal-lifecycle";
import { quarterRange, type FiscalQuarter } from "@/lib/fiscal";
import { createHealthIssue } from "@/lib/fiscal-health/issue";
import type {
  FiscalHealthCheck,
  FiscalHealthIssue,
  FiscalHealthModelStatus,
} from "@/lib/fiscal-health/types";
import type { FiscalHealthContext } from "@/lib/fiscal-health/context";
import {
  boxVal,
  collect349WarningSourceIds,
  index130IncomeTrace,
  index303Trace,
  index349YearTrace,
  round2,
  sourceKey,
} from "@/lib/fiscal-health/trace-utils";
import type { Model349OperationKey } from "@/lib/modelo-349";
import type { PurchaseVatKind } from "@/lib/modelo-303/vat-classification";

function check(
  id: string,
  label: string,
  passed: boolean,
  model?: FiscalHealthCheck["model"],
  detail?: string
): FiscalHealthCheck {
  return { id, label, passed, model, detail };
}

function quartersToAudit(ctx: FiscalHealthContext): FiscalQuarter[] {
  if (ctx.mode === "quarter" && ctx.quarter != null) return [ctx.quarter];
  return [1, 2, 3, 4];
}

function expected349KeyFrom303Line(
  line: Model303TraceLine
): Model349OperationKey | null {
  const k = line.vatKind;
  if (k === "EU_GOODS") return "A";
  if (k === "EU_SERVICES") return "I";
  if (k === "EU_DELIVERY") return "E";
  if (k === "EU_SERVICE") return "S";
  return null;
}

function expected303BoxGroups(kind: PurchaseVatKind, isInvestment: boolean): string[][] {
  switch (kind) {
    case "IMPORT_GOODS":
      return isInvestment ? [["32", "33", "34", "35"]] : [["32", "33"]];
    case "EU_GOODS":
      return isInvestment ? [["10", "11", "38", "39"]] : [["10", "11", "36", "37"]];
    case "EU_SERVICES":
    case "NON_EU_SERVICES":
    case "REVERSE_CHARGE_DOMESTIC":
      return [["10", "11", "36", "37"]];
    case "DOMESTIC":
      return isInvestment ? [["30", "31"]] : [["28", "29"]];
    default:
      return [];
  }
}

function lineMatchesBoxGroup(line: Model303TraceLine, group: string[]): boolean {
  const codes = line.boxCodes ?? [];
  return group.every((c) => codes.includes(c));
}

function isExplainable130Removal(
  ctx: FiscalHealthContext,
  sourceType: string,
  sourceId: string
): boolean {
  if (sourceType === "invoice") {
    const inv = ctx.invoicesYear.find((i) => i.id === sourceId);
    if (!inv) return true;
    if (inv.status === "ANULADA") return true;
    if (!isInvoiceIssued(inv)) return true;
    const sub = ctx.invoicesYear.find(
      (r) =>
        r.rectifiesInvoiceId === sourceId &&
        r.invoiceFiscalType === INVOICE_FISCAL_TYPE.RECTIFYING &&
        isInvoiceIssued(r) &&
        r.rectificationMethod === RECTIFICATION_METHOD.SUBSTITUTION
    );
    if (sub) return true;
  }
  if (sourceType === "marketplace") {
    const m = ctx.marketplaceYear.find((x) => x.id === sourceId);
    if (m?.invoiceId) return true;
  }
  return false;
}

function filing303Row(ctx: FiscalHealthContext, q: FiscalQuarter) {
  return ctx.filingsYear.find((f) => f.modelType === "303" && f.quarter === q);
}

export function run303CompensationChainChecks(
  ctx: FiscalHealthContext
): { issues: FiscalHealthIssue[]; checks: FiscalHealthCheck[] } {
  const issues: FiscalHealthIssue[] = [];
  const checks: FiscalHealthCheck[] = [];
  if (!ctx.chain303) return { issues, checks };

  let chainOk = true;

  for (const q of [1, 2, 3, 4] as FiscalQuarter[]) {
    const m = ctx.chain303[q];
    const b110 = boxVal(m.boxes, "110");
    const b78 = boxVal(m.boxes, "78");
    const b87 = boxVal(m.boxes, "87");
    const b71 = boxVal(m.boxes, "71");
    const b70 = boxVal(m.boxes, "70");
    const expected87 = round2(b110 - b78);
    const newNeg = round2(Math.max(0, -b71));
    const expectedCarry = round2(b87 + newNeg);

    if (b78 > b110 + 0.001) {
      chainOk = false;
      issues.push(
        createHealthIssue({
          code: "MODEL303_COMPENSATION_BOX78_EXCEEDS",
          severity: "ERROR",
          blocksFiling: true,
          title: `303 ${q}T: casilla 78 supera saldo anterior (110)`,
          description: `110=${b110} · 78=${b78}.`,
          model: "303",
          year: ctx.year,
          quarter: q,
        })
      );
    }
    if (!moneyEqual(b87, expected87)) {
      chainOk = false;
      issues.push(
        createHealthIssue({
          code: "MODEL303_COMPENSATION_BOX87_MISMATCH",
          severity: "ERROR",
          blocksFiling: true,
          title: `303 ${q}T: casilla 87 incoherente`,
          description: `87=${b87} pero 110−78=${expected87}.`,
          model: "303",
          year: ctx.year,
          quarter: q,
          evidence: { box87: b87, expected87, box110: b110, box78: b78 },
        })
      );
    }
    if (!moneyEqual(m.currentPeriodNegative ?? newNeg, newNeg)) {
      chainOk = false;
      issues.push(
        createHealthIssue({
          code: "MODEL303_NEGATIVE_BALANCE_MISMATCH",
          severity: "ERROR",
          blocksFiling: true,
          title: `303 ${q}T: saldo negativo interno incoherente`,
          description: `max(0,−71)=${newNeg}.`,
          model: "303",
          year: ctx.year,
          quarter: q,
        })
      );
    }
    if (!moneyEqual(m.carryForward ?? expectedCarry, expectedCarry)) {
      chainOk = false;
      issues.push(
        createHealthIssue({
          code: "MODEL303_CARRY_FORWARD_MISMATCH",
          severity: "ERROR",
          blocksFiling: true,
          title: `303 ${q}T: arrastre incoherente`,
          description: `Esperado ${expectedCarry}, motor ${m.carryForward ?? "—"}.`,
          model: "303",
          year: ctx.year,
          quarter: q,
        })
      );
    }
    if (b70 > 0 && b71 < 0) {
      chainOk = false;
      issues.push(
        createHealthIssue({
          code: "MODEL303_BOX70_ORDINARY_MISUSE",
          severity: "ERROR",
          blocksFiling: true,
          title: `303 ${q}T: casilla 70 no debe usarse como saldo negativo ordinario`,
          description: `box70=${b70} con box71 negativo.`,
          model: "303",
          year: ctx.year,
          quarter: q,
        })
      );
    }

    const presented = filing303Row(ctx, q);
    if (presented) {
      const carry = carryFromPresented303(presented);
      if (carry.legacyEstimate) {
        issues.push(
          createHealthIssue({
            code: "MODEL303_PRESENTED_LEGACY_CARRY",
            severity: "WARNING",
            blocksFiling: false,
            title: `303 ${q}T presentado sin casillas 87/71 detalladas`,
            description: "Auditoría de cadena parcial.",
            model: "303",
            year: ctx.year,
            quarter: q,
            sourceType: "filing",
            sourceId: presented.id,
          })
        );
      }
    }
  }

  for (const q of [1, 2, 3] as FiscalQuarter[]) {
    const next = (q + 1) as FiscalQuarter;
    const prev = ctx.chain303[q];
    const curr = ctx.chain303[next];
    const expected110 = round2(prev.carryForward ?? 0);
    const actual110 = boxVal(curr.boxes, "110");
    const presentedPrev = filing303Row(ctx, q);

    if (!moneyEqual(actual110, expected110)) {
      chainOk = false;
      issues.push(
        createHealthIssue({
          code: "MODEL303_CHAIN_CARRY_BREAK",
          severity: "ERROR",
          blocksFiling: Boolean(presentedPrev),
          title: `Cadena 303: ${q}T→${next}T saldo anterior incoherente`,
          description: `${next}T box110=${actual110} · arrastre ${q}T=${expected110}.`,
          model: "303",
          year: ctx.year,
          quarter: next,
          evidence: {
            fromPeriod: `${q}T`,
            toPeriod: `${next}T`,
            expectedCarry: expected110,
            actualCarry: actual110,
            source: presentedPrev ? "presented" : "draft",
            fromPresentedCarry: presentedPrev
              ? presented303CarryToPriorCompensation(
                  carryFromPresented303(presentedPrev)
                )
              : null,
          },
        })
      );
    }
  }

  checks.push(
    check(
      "303_compensation_chain",
      "Cadena de compensaciones IVA coherente",
      chainOk,
      "303"
    )
  );

  return { issues, checks };
}

export function run130YtdAndInvoicingChecks(
  ctx: FiscalHealthContext
): { issues: FiscalHealthIssue[]; checks: FiscalHealthCheck[] } {
  const issues: FiscalHealthIssue[] = [];
  const checks: FiscalHealthCheck[] = [];
  if (!ctx.chain130) return { issues, checks };

  let ytdOk = true;
  let invoicingOk = true;

  for (let q = 2; q <= 4; q++) {
    const prevQ = (q - 1) as FiscalQuarter;
    const currQ = q as FiscalQuarter;
    const prevIdx = index130IncomeTrace(ctx.chain130[prevQ].trace);
    const currIdx = index130IncomeTrace(ctx.chain130[currQ].trace);
    const { to } = quarterRange(ctx.year, currQ);

    for (const [key, line] of prevIdx) {
      if (currIdx.has(key)) continue;
      const [sourceType, sourceId] = key.split(":");
      if (isExplainable130Removal(ctx, sourceType, sourceId)) continue;
      ytdOk = false;
      issues.push(
        createHealthIssue({
          code: "MODEL130_YTD_SOURCE_DROPPED",
          severity: "ERROR",
          blocksFiling: true,
          title: `130 YTD: ingreso desaparece de ${prevQ}T a ${currQ}T`,
          description: `${line.description} sin explicación.`,
          model: "130",
          year: ctx.year,
          quarter: currQ,
          sourceType: sourceType as "invoice" | "marketplace",
          sourceId,
        })
      );
    }

    for (const [key, line] of currIdx) {
      const [sourceType, sourceId] = key.split(":");
      let issueDate: Date | null = null;
      if (sourceType === "invoice") {
        issueDate = ctx.invoicesYear.find((i) => i.id === sourceId)?.issueDate ?? null;
      } else if (sourceType === "marketplace") {
        issueDate =
          ctx.marketplaceYear.find((m) => m.id === sourceId)?.issueDate ?? null;
      }
      if (issueDate && issueDate > to) {
        ytdOk = false;
        issues.push(
          createHealthIssue({
            code: "MODEL130_YTD_FUTURE_SOURCE",
            severity: "ERROR",
            blocksFiling: true,
            title: `130 ${currQ}T: ingreso fuera de periodo YTD`,
            description: `${line.description} posterior al cierre del trimestre.`,
            model: "130",
            year: ctx.year,
            quarter: currQ,
            sourceType: sourceType as "invoice" | "marketplace",
            sourceId,
          })
        );
      }
    }
  }

  for (const q of quartersToAudit(ctx)) {
    const { to } = quarterRange(ctx.year, q);
    const expected = aggregateIrpfIncome({
      invoices: ctx.invoicesYear,
      marketplace: ctx.marketplaceYear,
      from: new Date(ctx.year, 0, 1),
      to,
    });
    const traceIdx = index130IncomeTrace(ctx.chain130[q].trace);
    const seen = new Set<string>();

    for (const line of expected.lines) {
      const key = sourceKey(line.sourceType, line.sourceId);
      if (!key) continue;
      if (!traceIdx.has(key)) {
        invoicingOk = false;
        issues.push(
          createHealthIssue({
            code: "MODEL130_INCOME_OMITTED",
            severity: "ERROR",
            blocksFiling: true,
            title: `Ingreso omitido en 130 ${q}T`,
            description: `${line.description} debería computar YTD.`,
            model: "130",
            year: ctx.year,
            quarter: q,
            sourceType: line.sourceType,
            sourceId: line.sourceId,
          })
        );
      }
      if (seen.has(key)) {
        invoicingOk = false;
        issues.push(
          createHealthIssue({
            code: "MODEL130_INCOME_DUPLICATE",
            severity: "ERROR",
            blocksFiling: true,
            title: `Ingreso duplicado en 130 ${q}T`,
            description: line.description,
            model: "130",
            year: ctx.year,
            quarter: q,
            sourceType: line.sourceType,
            sourceId: line.sourceId,
          })
        );
      }
      seen.add(key);
    }

    for (const inv of ctx.invoicesYear) {
      if (inv.issueDate > to) continue;
      if (inv.status === "ANULADA" && traceIdx.has(`invoice:${inv.id}`)) {
        invoicingOk = false;
        issues.push(
          createHealthIssue({
            code: "MODEL130_ANULLED_INCLUDED",
            severity: "ERROR",
            blocksFiling: true,
            title: `Factura anulada en 130 ${q}T`,
            description: inv.fullNumber,
            model: "130",
            year: ctx.year,
            quarter: q,
            sourceType: "invoice",
            sourceId: inv.id,
          })
        );
      }
      if (!isInvoiceIssued(inv) && traceIdx.has(`invoice:${inv.id}`)) {
        invoicingOk = false;
        issues.push(
          createHealthIssue({
            code: "MODEL130_DRAFT_INCLUDED",
            severity: "CRITICAL",
            blocksFiling: true,
            title: `DRAFT incluida en 130 ${q}T`,
            description: inv.fullNumber || inv.id,
            model: "130",
            year: ctx.year,
            quarter: q,
            sourceType: "invoice",
            sourceId: inv.id,
          })
        );
      }
    }

    for (const m of ctx.marketplaceYear) {
      if (m.issueDate > to) continue;
      if (!m.invoiceId) continue;
      const inv = ctx.invoicesYear.find((i) => i.id === m.invoiceId);
      if (
        inv &&
        isInvoiceIssued(inv) &&
        traceIdx.has(`marketplace:${m.id}`) &&
        traceIdx.has(`invoice:${inv.id}`)
      ) {
        invoicingOk = false;
        issues.push(
          createHealthIssue({
            code: "MODEL130_MARKETPLACE_INVOICE_DUP",
            severity: "ERROR",
            blocksFiling: true,
            title: `Doble cómputo marketplace + factura en 130 ${q}T`,
            description: `${m.channel} / ${inv.fullNumber}`,
            model: "130",
            year: ctx.year,
            quarter: q,
            sourceType: "marketplace",
            sourceId: m.id,
          })
        );
      }
    }
  }

  checks.push(
    check("130_ytd_coherent", "Acumulación YTD del 130 coherente", ytdOk, "130"),
    check(
      "130_invoicing_reconciled",
      "Facturación e ingresos 130 conciliados",
      invoicingOk,
      "130"
    )
  );

  return { issues, checks };
}

export function runExpenses303Checks(
  ctx: FiscalHealthContext
): { issues: FiscalHealthIssue[]; checks: FiscalHealthCheck[] } {
  const issues: FiscalHealthIssue[] = [];
  const checks: FiscalHealthCheck[] = [];
  if (!ctx.chain303) return { issues, checks };

  let ok = true;
  const relevantKinds = new Set([
    "DOMESTIC",
    "EU_GOODS",
    "EU_SERVICES",
    "NON_EU_SERVICES",
    "REVERSE_CHARGE_DOMESTIC",
    "IMPORT_GOODS",
  ]);

  for (const q of quartersToAudit(ctx)) {
    const { from, to } = quarterRange(ctx.year, q);
    const traceIdx = index303Trace(ctx.chain303[q].trace303);

    for (const e of ctx.expensesYear) {
      if (e.issueDate < from || e.issueDate > to) continue;
      const kind = parsePurchaseVatKind(e.vatOperationType);
      if (!relevantKinds.has(kind)) continue;
      if (kind === "IMPORT_GOODS") {
        const base = e.importDuaBase != null ? Number(e.importDuaBase) : null;
        const vat = e.importDuaVat != null ? Number(e.importDuaVat) : null;
        if (base == null || vat == null) continue;
      }

      const key = sourceKey("expense", e.id);
      const lines = key ? traceIdx.get(key) : undefined;
      const groups = expected303BoxGroups(kind, e.isInvestment);

      if (!lines?.length) {
        ok = false;
        issues.push(
          createHealthIssue({
            code: "EXPENSE_MISSING_303",
            severity: "ERROR",
            blocksFiling: true,
            title: `Gasto ausente del 303 ${q}T`,
            description: `${e.supplierName} (${kind}).`,
            model: "303",
            year: ctx.year,
            quarter: q,
            sourceType: "expense",
            sourceId: e.id,
            evidence: {
              expenseId: e.id,
              vatKind: kind,
              expectedTraceCategory: groups[0],
              foundBoxes: [],
            },
          })
        );
        continue;
      }

      if (lines.length > 1) {
        const boxSets = lines.map((l) => (l.boxCodes ?? []).join(","));
        if (new Set(boxSets).size > 1) {
          ok = false;
          issues.push(
            createHealthIssue({
              code: "EXPENSE_DOUBLE_303",
              severity: "ERROR",
              blocksFiling: true,
              title: `Gasto duplicado en 303 ${q}T`,
              description: e.supplierName,
              model: "303",
              year: ctx.year,
              quarter: q,
              sourceType: "expense",
              sourceId: e.id,
            })
          );
        }
      }

      const hasCurrent = lines.some((l) => lineMatchesBoxGroup(l, ["28", "29"]));
      const hasInvestment = lines.some((l) => lineMatchesBoxGroup(l, ["30", "31"]));
      if (hasCurrent && hasInvestment) {
        ok = false;
        issues.push(
          createHealthIssue({
            code: "EXPENSE_INVESTMENT_DOUBLE_303",
            severity: "ERROR",
            blocksFiling: true,
            title: `Inversión y corriente · ${e.supplierName}`,
            description: "28/29 y 30/31 simultáneos.",
            model: "303",
            year: ctx.year,
            quarter: q,
            sourceType: "expense",
            sourceId: e.id,
          })
        );
      }

      const importCurrent = lines.some((l) => lineMatchesBoxGroup(l, ["32", "33"]));
      const importInv = lines.some((l) => lineMatchesBoxGroup(l, ["34", "35"]));
      if (importCurrent && importInv) {
        ok = false;
        issues.push(
          createHealthIssue({
            code: "EXPENSE_IMPORT_DOUBLE_303",
            severity: "ERROR",
            blocksFiling: true,
            title: `Importación duplicada · ${e.supplierName}`,
            description: "32/33 y 34/35 simultáneos.",
            model: "303",
            year: ctx.year,
            quarter: q,
            sourceType: "expense",
            sourceId: e.id,
          })
        );
      }
    }
  }

  checks.push(
    check("expenses_303_reconciled", "Gastos IVA conciliados con 303", ok, "303")
  );

  return { issues, checks };
}

export function run303349TraceChecks(
  ctx: FiscalHealthContext
): { issues: FiscalHealthIssue[]; checks: FiscalHealthCheck[] } {
  const issues: FiscalHealthIssue[] = [];
  const checks: FiscalHealthCheck[] = [];
  if (!ctx.chain303 || ctx.draft349All.length === 0) return { issues, checks };

  let ok = true;
  const idx349 = index349YearTrace(ctx.draft349All);
  const warn349 = collect349WarningSourceIds(ctx.draft349All);

  for (const q of quartersToAudit(ctx)) {
    const { from, to } = quarterRange(ctx.year, q);
    const draft349Q = ctx.draft349All.find((d) => d.quarter === q);
    const trace303 = index303Trace(ctx.chain303[q].trace303);

    for (const [key, lines] of trace303) {
      const euLine = lines.find((l) => expected349KeyFrom303Line(l));
      if (!euLine) continue;
      const expectedKey = expected349KeyFrom303Line(euLine)!;
      const [, sourceId] = key.split(":");
      const in349 = idx349
        .get(key)
        ?.some((e) => e.quarter === q && e.key === expectedKey);
      if (in349) continue;

      if (warn349.has(sourceId) || draft349Q?.incompleteVatId) {
        issues.push(
          createHealthIssue({
            code: "EU_OPERATION_MISSING_349_REVIEW",
            severity: "WARNING",
            blocksFiling: false,
            title: `Operación UE en 303 sin 349 · revisión`,
            description: "Exclusión legítima o NIF-IVA pendiente.",
            model: "349",
            relatedModels: ["303"],
            year: ctx.year,
            quarter: q,
            sourceId,
          })
        );
        continue;
      }

      ok = false;
      issues.push(
        createHealthIssue({
          code: "EU_OPERATION_MISSING_349",
          severity: "ERROR",
          blocksFiling: true,
          title: `Operación UE en 303 ausente del 349 ${q}T`,
          description: `Debería declararse como ${expectedKey}.`,
          model: "349",
          relatedModels: ["303"],
          year: ctx.year,
          quarter: q,
          sourceId,
        })
      );
    }

    if (!draft349Q) continue;
    for (const op of draft349Q.operations) {
      for (const t of op.trace) {
        const d = t.issueDate.slice(0, 10);
        if (d < from.toISOString().slice(0, 10)) continue;
        if (d > to.toISOString().slice(0, 10)) continue;
        const key = sourceKey(t.sourceType, t.sourceId);
        if (!key) continue;
        const in303 = trace303.get(key);
        if (in303?.some((l) => expected349KeyFrom303Line(l) === op.key)) continue;

        ok = false;
        issues.push(
          createHealthIssue({
            code: "MODEL349_OPERATION_MISSING_303",
            severity: "ERROR",
            blocksFiling: true,
            title: `349 ${op.key} sin tratamiento IVA en 303 ${q}T`,
            description: op.operatorName,
            model: "303",
            relatedModels: ["349"],
            year: ctx.year,
            quarter: q,
            sourceType: t.sourceType,
            sourceId: t.sourceId,
            href: t.href,
          })
        );
      }
    }
  }

  checks.push(
    check(
      "303_349_eu_reconciled",
      "Operaciones UE conciliadas entre 303 y 349",
      ok,
      "349"
    )
  );

  return { issues, checks };
}

export function runRectificationCrossChecks(
  ctx: FiscalHealthContext
): { issues: FiscalHealthIssue[]; checks: FiscalHealthCheck[] } {
  const issues: FiscalHealthIssue[] = [];
  const checks: FiscalHealthCheck[] = [];
  if (!ctx.chain303) return { issues, checks };

  let ok = true;
  const rects = ctx.invoicesYear.filter(
    (i) =>
      i.invoiceFiscalType === INVOICE_FISCAL_TYPE.RECTIFYING && isInvoiceIssued(i)
  );

  for (const r of rects) {
    if (!r.rectifiesInvoiceId) continue;
    const original = ctx.invoicesYear.find((i) => i.id === r.rectifiesInvoiceId);
    if (!original) {
      ok = false;
      issues.push(
        createHealthIssue({
          code: "RECTIFICATION_ORIGINAL_MISSING",
          severity: "ERROR",
          blocksFiling: true,
          title: `Rectificativa ${r.fullNumber}: original ausente`,
          description: "La original debe conservarse.",
          sourceType: "invoice",
          sourceId: r.id,
          year: ctx.year,
        })
      );
      continue;
    }

    let count303 = 0;
    for (const q of [1, 2, 3, 4] as FiscalQuarter[]) {
      const idx = index303Trace(ctx.chain303[q].trace303);
      count303 += idx.get(`invoice:${r.id}`)?.length ?? 0;
    }

    if (count303 === 0) {
      ok = false;
      issues.push(
        createHealthIssue({
          code: "RECTIFICATION_MISSING_303",
          severity: "ERROR",
          blocksFiling: true,
          title: `Rectificativa ${r.fullNumber} ausente del 303`,
          description: "Debe reflejarse en el trimestre de devengo.",
          model: "303",
          sourceType: "invoice",
          sourceId: r.id,
          year: ctx.year,
        })
      );
    }
    if (count303 > 1) {
      ok = false;
      issues.push(
        createHealthIssue({
          code: "RECTIFICATION_DOUBLE_COUNTED",
          severity: "ERROR",
          blocksFiling: true,
          title: `Rectificativa ${r.fullNumber} duplicada en 303`,
          description: `${count303} apariciones en traces.`,
          model: "303",
          sourceType: "invoice",
          sourceId: r.id,
          year: ctx.year,
        })
      );
    }
  }

  checks.push(
    check(
      "rectifications_303_390",
      "Rectificativas conciliadas con 303/390",
      ok,
      "303"
    )
  );

  return { issues, checks };
}

export function runObligationChecks(
  ctx: FiscalHealthContext,
  allIssues: FiscalHealthIssue[] = []
): {
  issues: FiscalHealthIssue[];
  checks: FiscalHealthCheck[];
  modelStatuses: FiscalHealthModelStatus[];
} {
  const issues: FiscalHealthIssue[] = [];
  const checks: FiscalHealthCheck[] = [];
  const modelStatuses: FiscalHealthModelStatus[] = [];
  let ok = true;

  function statusFor(
    model: FiscalHealthModelStatus["model"],
    quarter: FiscalQuarter | null
  ): FiscalHealthModelStatus["status"] {
    const relevant = allIssues.filter(
      (i) =>
        (i.model === model || i.relatedModels?.includes(model as "303")) &&
        (quarter == null || i.quarter == null || i.quarter === quarter)
    );
    if (relevant.some((i) => i.blocksFiling)) return "NOT_READY";
    if (relevant.some((i) => i.severity === "ERROR" || i.severity === "CRITICAL"))
      return "NOT_READY";
    if (relevant.some((i) => i.severity === "WARNING" || i.severity === "INFO"))
      return "READY_WITH_WARNINGS";
    return "READY";
  }

  for (const q of quartersToAudit(ctx)) {
    const presented130 = ctx.filingsYear.some(
      (f) => f.modelType === "130" && f.quarter === q
    );
    const presented303 = ctx.filingsYear.some(
      (f) => f.modelType === "303" && f.quarter === q
    );
    const m130 = ctx.chain130?.[q];
    const obligation130 =
      m130?.filingObligation?.status ??
      (ctx.settings?.fiscalRegime === "131" ? "UNKNOWN" : "REQUIRED");

    modelStatuses.push({
      model: "130",
      label: `130 ${q}T`,
      status: statusFor("130", q),
      presented: presented130,
      obligation:
        obligation130 === "NOT_REQUIRED"
          ? "NOT_APPLICABLE"
          : obligation130 === "UNKNOWN"
            ? "UNKNOWN"
            : "REQUIRED",
    });

    if (obligation130 === "UNKNOWN" && ctx.settings?.fiscalRegime !== "131") {
      ok = false;
      issues.push(
        createHealthIssue({
          code: "OBLIGATION_130_UNKNOWN",
          severity: "WARNING",
          blocksFiling: false,
          title: `130 ${q}T: obligación desconocida`,
          description: "Completa datos de actividad en Ajustes.",
          model: "130",
          year: ctx.year,
          quarter: q,
        })
      );
    }

    modelStatuses.push({
      model: "303",
      label: `303 ${q}T`,
      status: statusFor("303", q),
      presented: presented303,
      obligation: "REQUIRED",
    });

    const d349 = ctx.draft349All.find((d) => d.quarter === q);
    modelStatuses.push({
      model: "349",
      label: `349 ${q}T`,
      status: statusFor("349", q),
      presented: ctx.filingsYear.some(
        (f) => f.modelType === "349" && f.quarter === q
      ),
      obligation: d349?.hasOps ? "REQUIRED" : "NOT_APPLICABLE",
    });
  }

  if (ctx.mode === "annual") {
    const ob390 = ctx.model390?.filingObligation.status ?? "UNKNOWN";
    modelStatuses.push({
      model: "390",
      label: "390",
      status: statusFor("390", null),
      presented: Boolean(ctx.presented390),
      obligation: ob390,
    });
    modelStatuses.push({
      model: "347",
      label: "347",
      status: statusFor("347", null),
      presented: Boolean(ctx.presented347),
      obligation: "REQUIRED",
    });
  }

  checks.push(
    check(
      "obligations_coherent",
      "Obligaciones fiscales sin incoherencias detectadas",
      ok,
      "HEALTH"
    )
  );

  return { issues, checks, modelStatuses };
}

export function hasPostFilingRectification(
  ctx: FiscalHealthContext,
  modelType: "303" | "130",
  quarter: FiscalQuarter
): boolean {
  const filing = ctx.filingsYear.find(
    (f) => f.modelType === modelType && f.quarter === quarter
  );
  if (!filing?.filedAt) return false;
  return ctx.invoicesYear.some(
    (inv) =>
      inv.invoiceFiscalType === INVOICE_FISCAL_TYPE.RECTIFYING &&
      isInvoiceIssued(inv) &&
      inv.issueDate > filing.filedAt
  );
}
