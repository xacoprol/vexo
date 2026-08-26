import { comparePresentedVsDraft } from "@/lib/modelo-303/presentation";
import { compare347PresentedVsDraft } from "@/lib/modelo-347/presentation";
import { compare349PresentedVsDraft } from "@/lib/modelo-349/presentation";
import { compare390PresentedVsDraft } from "@/lib/modelo-390/presentation";
import { moneyEqual } from "@/lib/modelo-390/money";
import { clampPct } from "@/lib/expense-deductibility";
import { isInvoiceIssued } from "@/lib/invoice-fiscal-lifecycle";
import { INVOICE_FISCAL_TYPE } from "@/lib/invoice-rectification";
import {
  validateInvoiceForIssuance,
} from "@/lib/invoice-issuance";
import { createHealthIssue } from "@/lib/fiscal-health/issue";
import type {
  FiscalHealthCheck,
  FiscalHealthIssue,
  FiscalHealthModelStatus,
} from "@/lib/fiscal-health/types";
import {
  isDraftInvoiceId,
  type FiscalHealthContext,
} from "@/lib/fiscal-health/context";
import type { FiscalQuarter } from "@/lib/fiscal";
import type { FiscalModelType } from "@/lib/gemini-fiscal-filing";
import {
  hasPostFilingRectification,
  run303CompensationChainChecks,
  run130YtdAndInvoicingChecks,
  runExpenses303Checks,
  run303349TraceChecks,
  runRectificationCrossChecks,
  runObligationChecks,
} from "@/lib/fiscal-health/extended-checks";

export type ChecksOutput = {
  issues: FiscalHealthIssue[];
  checks: FiscalHealthCheck[];
  modelStatuses: FiscalHealthModelStatus[];
};

function check(
  id: string,
  label: string,
  passed: boolean,
  model?: FiscalHealthCheck["model"],
  detail?: string
): FiscalHealthCheck {
  return { id, label, passed, model, detail };
}

function traceSourceIds(
  trace: Record<string, { sourceId?: string; sourceType?: string }[] | undefined> | undefined
): { sourceId: string; sourceType: string }[] {
  if (!trace) return [];
  const out: { sourceId: string; sourceType: string }[] = [];
  for (const lines of Object.values(trace)) {
    if (!lines) continue;
    for (const line of lines) {
      if (line.sourceId) {
        out.push({
          sourceId: line.sourceId,
          sourceType: line.sourceType ?? "unknown",
        });
      }
    }
  }
  return out;
}

function normalizeMotorWarning(
  w: { code: string; message: string; sourceId?: string },
  model: FiscalModelType | string,
  year: number,
  quarter?: FiscalQuarter | null
): FiscalHealthIssue {
  const blocks =
    w.code.includes("MISSING") ||
    w.code.includes("INCOMPLETE") ||
    w.code.includes("REVIEW_REQUIRED") ||
    w.code === "IMPORT_DOCUMENT_MISSING";
  return createHealthIssue({
    code: `MOTOR_${w.code}`,
    severity: blocks ? "ERROR" : "WARNING",
    blocksFiling: blocks && w.code === "IMPORT_DOCUMENT_MISSING",
    title: w.message.split(".")[0] ?? w.message,
    description: w.message,
    model: model as FiscalModelType,
    year,
    quarter,
    sourceId: w.sourceId,
    originalCode: w.code,
    sourceModel: model,
    sourcePeriod: quarter ? `${quarter}T${year}` : `${year}`,
  });
}

export function runFiscalHealthChecks(ctx: FiscalHealthContext): ChecksOutput {
  const issues: FiscalHealthIssue[] = [];
  const checks: FiscalHealthCheck[] = [];

  // ── 4. ISSUED invoices ──
  let issuedProblems = 0;
  for (const inv of ctx.invoices.filter((i) => isInvoiceIssued(i))) {
    if (inv.status === "ANULADA") continue;
    const validation = validateInvoiceForIssuance({
      status: inv.status,
      fullNumber: inv.fullNumber,
      issueDate: inv.issueDate,
      subtotal: inv.subtotal,
      vatAmount: inv.vatAmount,
      total: inv.total,
      invoiceKind: inv.invoiceKind,
      lineCount: inv.lineCount,
      clientNif: inv.clientNif,
      clientName: inv.clientName,
      issuerNif: ctx.settings?.nif,
      simplifiedInvoiceMaxAmount: ctx.settings?.simplifiedInvoiceMaxAmount,
    });
    if (!validation.valid) {
      issuedProblems++;
      issues.push(
        createHealthIssue({
          code: "ISSUED_VALIDATION_FAILED",
          severity: "CRITICAL",
          blocksFiling: true,
          title: `Factura emitida ${inv.fullNumber} con datos incompletos`,
          description: validation.errors.join(" "),
          model: "HEALTH",
          year: ctx.year,
          quarter: ctx.quarter,
          sourceType: "invoice",
          sourceId: inv.id,
          href: `/invoices/${inv.id}`,
        })
      );
    }
    if (!inv.verifactuHash && ctx.settings?.verifactuMode !== "NO_VERIFACTU") {
      issuedProblems++;
      issues.push(
        createHealthIssue({
          code: "ISSUED_MISSING_VERIFACTU_HASH",
          severity: "CRITICAL",
          blocksFiling: true,
          title: `Factura ${inv.fullNumber} emitida sin sello Veri*Factu`,
          description:
            "Una factura ISSUED debe tener huella de registro fiscal cuando el modo Veri*Factu está activo.",
          sourceType: "invoice",
          sourceId: inv.id,
          href: `/invoices/${inv.id}`,
          year: ctx.year,
          quarter: ctx.quarter,
        })
      );
    }
    if (inv.invoiceFiscalType === INVOICE_FISCAL_TYPE.RECTIFYING) {
      if (!inv.rectifiesInvoiceId) {
        issues.push(
          createHealthIssue({
            code: "RECTIFYING_WITHOUT_ORIGINAL",
            severity: "ERROR",
            blocksFiling: true,
            title: `Rectificativa ${inv.fullNumber} sin factura original`,
            description: "Toda rectificativa debe referenciar la factura que corrige.",
            sourceType: "invoice",
            sourceId: inv.id,
            href: `/invoices/${inv.id}`,
            year: ctx.year,
            quarter: ctx.quarter,
          })
        );
      }
      if (!inv.rectificationType) {
        issues.push(
          createHealthIssue({
            code: "RECTIFYING_WITHOUT_TYPE",
            severity: "ERROR",
            blocksFiling: true,
            title: `Rectificativa ${inv.fullNumber} sin tipo R1–R5`,
            description: "Indica el tipo legal de rectificativa.",
            sourceType: "invoice",
            sourceId: inv.id,
            href: `/invoices/${inv.id}`,
            year: ctx.year,
            quarter: ctx.quarter,
          })
        );
      }
      if (!inv.rectificationMethod) {
        issues.push(
          createHealthIssue({
            code: "RECTIFYING_WITHOUT_METHOD",
            severity: "ERROR",
            blocksFiling: true,
            title: `Rectificativa ${inv.fullNumber} sin método I/S`,
            description: "Indica si la rectificativa es por diferencias (I) o sustitución (S).",
            sourceType: "invoice",
            sourceId: inv.id,
            href: `/invoices/${inv.id}`,
            year: ctx.year,
            quarter: ctx.quarter,
          })
        );
      }
    }
  }
  checks.push(
    check(
      "issued_invoices_valid",
      "Facturas ISSUED válidas",
      issuedProblems === 0,
      "HEALTH"
    )
  );

  // ── 5. Numeración ──
  const issuedByNumber = new Map<string, typeof ctx.invoices>();
  for (const inv of ctx.invoices.filter((i) => isInvoiceIssued(i))) {
    const key = inv.fullNumber.trim().toUpperCase();
    const list = issuedByNumber.get(key) ?? [];
    list.push(inv);
    issuedByNumber.set(key, list);
  }
  let dupCount = 0;
  for (const [num, list] of issuedByNumber) {
    if (list.length > 1) {
      dupCount++;
      issues.push(
        createHealthIssue({
          code: "INVOICE_NUMBER_DUPLICATE",
          severity: "CRITICAL",
          blocksFiling: true,
          title: `Número de factura duplicado: ${num}`,
          description: `${list.length} facturas ISSUED comparten el mismo número.`,
          sourceType: "series",
          sourceId: num,
          year: ctx.year,
          quarter: ctx.quarter,
        })
      );
    }
  }
  checks.push(
    check(
      "invoice_numbering_unique",
      "Numeración ISSUED sin duplicados",
      dupCount === 0,
      "HEALTH"
    )
  );

  // ── 6. VeriFactu ──
  for (const v of ctx.verifactu.issues) {
    const critical =
      v.code === "HASH_CHAIN_BREAK" || v.code === "ANULADA_WITHOUT_EVENT";
    issues.push(
      createHealthIssue({
        code: `VERIFACTU_${v.code}`,
        severity: critical ? "CRITICAL" : "WARNING",
        blocksFiling: critical,
        title: v.fullNumber ? `Veri*Factu · ${v.fullNumber}` : "Veri*Factu",
        description: v.message,
        sourceType: "invoice",
        sourceId: v.invoiceId || undefined,
        href: v.invoiceId ? `/invoices/${v.invoiceId}` : "/fiscal/verifactu",
        year: ctx.year,
        quarter: ctx.quarter,
      })
    );
  }
  checks.push(
    check(
      "verifactu_chain",
      "Cadena Veri*Factu sin rupturas críticas",
      !ctx.verifactu.issues.some((i) =>
        ["HASH_CHAIN_BREAK", "ANULADA_WITHOUT_EVENT"].includes(i.code)
      ),
      "HEALTH"
    )
  );

  // ── 7. DRAFT en modelos (regresión) ──
  let draftInModel = false;
  if (ctx.periodSummary?.modelo303.trace303) {
    for (const { sourceId, sourceType } of traceSourceIds(
      ctx.periodSummary.modelo303.trace303
    )) {
      if (sourceType === "invoice" && isDraftInvoiceId(ctx, sourceId)) {
        draftInModel = true;
        issues.push(
          createHealthIssue({
            code: "DRAFT_IN_MODEL_303",
            severity: "CRITICAL",
            blocksFiling: true,
            title: "Factura DRAFT incluida en borrador 303",
            description:
              "Regresión Fase 1: una factura no emitida aparece en el cálculo del 303.",
            model: "303",
            sourceType: "invoice",
            sourceId,
            href: `/invoices/${sourceId}`,
            year: ctx.year,
            quarter: ctx.quarter,
          })
        );
      }
    }
  }
  checks.push(
    check(
      "no_draft_in_models",
      "Sin facturas DRAFT en modelos",
      !draftInModel,
      "303"
    )
  );

  // ── 8. Anuladas ──
  const annulled = ctx.invoices.filter((i) => i.status === "ANULADA");
  let annulIssue = false;
  for (const inv of annulled) {
    if (!inv.fullNumber?.trim()) {
      annulIssue = true;
      issues.push(
        createHealthIssue({
          code: "ANULATED_MISSING_NUMBER",
          severity: "ERROR",
          blocksFiling: false,
          title: `Factura anulada sin número conservado`,
          description: "Las facturas anuladas deben conservar su numeración histórica.",
          sourceType: "invoice",
          sourceId: inv.id,
          href: `/invoices/${inv.id}`,
          year: ctx.year,
          quarter: ctx.quarter,
        })
      );
    }
  }
  checks.push(
    check(
      "annulled_preserved",
      "Facturas anuladas conservadas históricamente",
      !annulIssue,
      "HEALTH"
    )
  );

  // ── 14–16. Gastos ──
  let expenseIssues = 0;
  for (const e of ctx.expenses) {
    const vatPct = clampPct(e.vatDeductiblePct);
    const irpfPct = clampPct(e.irpfDeductiblePct);
    if (vatPct < 0 || vatPct > 100 || irpfPct < 0 || irpfPct > 100) {
      expenseIssues++;
      issues.push(
        createHealthIssue({
          code: "EXPENSE_INVALID_DEDUCTIBILITY_PCT",
          severity: "ERROR",
          blocksFiling: true,
          title: `Gasto ${e.supplierName}: porcentajes deducibles inválidos`,
          description: "Los porcentajes IVA/IRPF deben estar entre 0 y 100.",
          sourceType: "expense",
          sourceId: e.id,
          href: `/fiscal/expenses/${e.id}/edit`,
          year: ctx.year,
          quarter: ctx.quarter,
        })
      );
    }
    if (e.invoiceNumber && !e.documentId) {
      issues.push(
        createHealthIssue({
          code: "DOCUMENTATION_INCOMPLETE",
          severity: "WARNING",
          blocksFiling: false,
          title: `Gasto ${e.supplierName} sin documento adjunto`,
          description:
            "Hay número de factura de proveedor pero no hay PDF/imagen asociado.",
          sourceType: "expense",
          sourceId: e.id,
          href: `/fiscal/expenses/${e.id}/edit`,
          year: ctx.year,
          quarter: ctx.quarter,
        })
      );
    }
    if (e.vatOperationType === "IMPORTACION_BIENES") {
      const base = e.importDuaBase != null ? Number(e.importDuaBase) : null;
      const vat = e.importDuaVat != null ? Number(e.importDuaVat) : null;
      if (base == null || vat == null || !Number.isFinite(base) || !Number.isFinite(vat)) {
        expenseIssues++;
        issues.push(
          createHealthIssue({
            code: "IMPORT_DOCUMENT_MISSING",
            severity: "ERROR",
            blocksFiling: true,
            title: `Importación sin DUA completo · ${e.supplierName}`,
            description:
              "Falta base/cuota del documento aduanero. VEXO no inventa IVA de importación desde la factura del proveedor.",
            model: "303",
            relatedModels: ["390"],
            sourceType: "expense",
            sourceId: e.id,
            href: `/fiscal/expenses/${e.id}/edit`,
            year: ctx.year,
            quarter: ctx.quarter,
            originalCode: "IMPORT_DOCUMENT_MISSING",
            sourceModel: "303",
          })
        );
      }
    }
  }
  checks.push(
    check("expenses_valid", "Gastos con deducibilidad y DUA coherentes", expenseIssues === 0, "303")
  );

  // ── 21. Marketplace ──
  let marketplaceDouble = 0;
  for (const m of ctx.marketplace) {
    if (m.invoiceId) {
      const inv = ctx.invoices.find((i) => i.id === m.invoiceId);
      if (inv && isInvoiceIssued(inv) && inv.status !== "ANULADA") {
        marketplaceDouble++;
        issues.push(
          createHealthIssue({
            code: "MARKETPLACE_DOUBLE_COUNT",
            severity: "ERROR",
            blocksFiling: true,
            title: `Doble cómputo marketplace · ${m.channel}`,
            description: `El pedido ${m.orderId ?? m.id} tiene factura ISSUED vinculada — no debe computarse también como ingreso marketplace suelto.`,
            sourceType: "marketplace",
            sourceId: m.id,
            href: `/fiscal/income/${m.id}/edit`,
            year: ctx.year,
            quarter: ctx.quarter,
          })
        );
      }
    }
    if (!m.vatStatus) {
      issues.push(
        createHealthIssue({
          code: "MARKETPLACE_UNCLASSIFIED",
          severity: "WARNING",
          blocksFiling: false,
          title: `Ingreso marketplace sin clasificación fiscal`,
          description: `Canal ${m.channel}: revisa si es OSS, B2B o facturado.`,
          sourceType: "marketplace",
          sourceId: m.id,
          href: `/fiscal/income/${m.id}/edit`,
          year: ctx.year,
          quarter: ctx.quarter,
        })
      );
    }
  }
  checks.push(
    check(
      "marketplace_no_double",
      "Sin doble cómputo marketplace + factura",
      marketplaceDouble === 0,
      "303"
    )
  );

  // ── Quarter: 303, 130, 349 ──
  const modelStatuses: FiscalHealthModelStatus[] = [];

  if (ctx.mode === "quarter" && ctx.periodSummary && ctx.quarter != null) {
    const q = ctx.quarter;
    const m303 = ctx.periodSummary.modelo303;
    const m130 = ctx.periodSummary.modelo130;

    for (const w of m303?.warnings ?? []) {
      issues.push(normalizeMotorWarning(w, "303", ctx.year, q));
    }
    for (const w of m130?.warnings ?? []) {
      issues.push(normalizeMotorWarning(w, "130", ctx.year, q));
    }

    if (ctx.presented303) {
      const cmp = comparePresentedVsDraft(
        Number(ctx.presented303.result),
        m303.result
      );
      if (!cmp.matches) {
        const explained =
          ctx.quarter != null &&
          hasPostFilingRectification(ctx, "303", ctx.quarter);
        issues.push(
          createHealthIssue({
            code: explained
              ? "FILING_DIVERGENCE_EXPLAINED_RECTIFICATION"
              : "FILING_DIVERGENCE",
            severity: explained ? "INFO" : "WARNING",
            blocksFiling: false,
            title: explained
              ? `303 ${q}T presentado difiere por rectificaciones posteriores`
              : `303 ${q}T presentado difiere del motor actual`,
            description: explained
              ? "Hay rectificativas emitidas después de la fecha de presentación; el tratamiento puede estar en un trimestre posterior."
              : `Presentado: ${ctx.presented303.result} · Motor: ${m303.result}. El histórico presentado no se modifica.`,
            model: "303",
            year: ctx.year,
            quarter: q,
            evidence: { presented: ctx.presented303.result, current: m303.result },
          })
        );
      } else {
        checks.push(check("303_filing_match", "303 presentado coincide con motor", true, "303"));
      }
    }

    if (ctx.draft349) {
      for (const w of ctx.draft349.warnings) {
        issues.push(normalizeMotorWarning(w, "349", ctx.year, q));
      }
      if (ctx.draft349.incompleteVatId) {
        issues.push(
          createHealthIssue({
            code: "MODEL349_INCOMPLETE_VAT_ID",
            severity: "ERROR",
            blocksFiling: true,
            title: "349 con operador UE sin NIF-IVA",
            description: "Completa el identificador fiscal de las operaciones intracomunitarias.",
            model: "349",
            year: ctx.year,
            quarter: q,
          })
        );
      }
      if (ctx.presented349) {
        const cmp = compare349PresentedVsDraft(ctx.draft349, ctx.presented349);
        if (!cmp.matches) {
          issues.push(
            createHealthIssue({
              code: "FILING_DIVERGENCE",
              severity: "WARNING",
              blocksFiling: false,
              title: `349 ${q}T presentado difiere del motor`,
              description: "Revisa operaciones E/A/S/I.",
              model: "349",
              year: ctx.year,
              quarter: q,
            })
          );
        }
      }
    }

    modelStatuses.push(
      {
        model: "303",
        label: "303",
        status: issues.some((i) => i.model === "303" && i.blocksFiling)
          ? "NOT_READY"
          : issues.some((i) => i.model === "303")
            ? "READY_WITH_WARNINGS"
            : "READY",
        presented: Boolean(ctx.presented303),
      },
      {
        model: "130",
        label: "130",
        status: issues.some((i) => i.model === "130" && i.blocksFiling)
          ? "NOT_READY"
          : "READY",
        presented: Boolean(ctx.presented130),
        obligation:
          ctx.settings?.fiscalRegime === "131" ? "NOT_APPLICABLE" : "REQUIRED",
      },
      {
        model: "349",
        label: "349",
        status: ctx.draft349?.hasOps
          ? issues.some((i) => i.model === "349" && i.blocksFiling)
            ? "NOT_READY"
            : "READY_WITH_WARNINGS"
          : "READY",
        presented: Boolean(ctx.presented349),
        obligation: ctx.draft349?.hasOps ? "REQUIRED" : "NOT_APPLICABLE",
      }
    );
  }

  // ── Annual: 347 ──
  if (ctx.mode === "annual" && ctx.draft347) {
    for (const w of ctx.draft347.warnings) {
      issues.push(normalizeMotorWarning(w, "347", ctx.year, null));
    }
    if (ctx.draft347.requiresReview) {
      issues.push(
        createHealthIssue({
          code: "MODEL347_REQUIRES_REVIEW",
          severity: "WARNING",
          blocksFiling: false,
          title: "347 requiere revisión",
          description: "El motor 347 señala operaciones o RECC incompletos.",
          model: "347",
          year: ctx.year,
        })
      );
    }

    const ids349 = new Set<string>();
    for (const d349 of ctx.draft349Year) {
      for (const op of d349.operations) {
        for (const t of op.trace) ids349.add(t.sourceId);
      }
    }
    for (const op of ctx.draft347.declarableOperators) {
      for (const t of op.trace) {
        if (ids349.has(t.sourceId)) {
          issues.push(
            createHealthIssue({
              code: "MODEL347_349_DUPLICATE",
              severity: "ERROR",
              blocksFiling: true,
              title: `Operación en 347 y 349 · ${op.name}`,
              description:
                "Esta operación intracomunitaria no debe declararse simultáneamente en 347 y 349.",
              model: "347",
              relatedModels: ["349"],
              sourceType: t.sourceType === "invoice" ? "invoice" : "expense",
              sourceId: t.sourceId,
              href: t.href,
              year: ctx.year,
            })
          );
        }
      }
    }

    if (ctx.presented347) {
      const cmp = compare347PresentedVsDraft(ctx.draft347, ctx.presented347);
      if (!cmp.matches) {
        issues.push(
          createHealthIssue({
            code: "FILING_DIVERGENCE",
            severity: "WARNING",
            blocksFiling: false,
            title: "347 presentado difiere del motor",
            description: "Revisa operadores declarables.",
            model: "347",
            year: ctx.year,
          })
        );
      }
    }

    checks.push(
      check(
        "347_349_no_overlap",
        "347 y 349 no se solapan por operación",
        !issues.some((i) => i.code === "MODEL347_349_DUPLICATE"),
        "347"
      )
    );

    modelStatuses.push({
      model: "347",
      label: "347",
      status: ctx.draft347.requiresReview ? "READY_WITH_WARNINGS" : "READY",
      presented: Boolean(ctx.presented347),
      obligation: "REQUIRED",
    });
  }

  // ── Annual: 390 ──
  if (ctx.mode === "annual" && ctx.model390) {
    const m390 = ctx.model390;
    for (const w of m390.warnings) {
      issues.push(normalizeMotorWarning(w, "390", ctx.year, null));
    }

    const rec = m390.reconciliation;
    if (rec.status === "DIFFERENCES") {
      for (const d of rec.differences) {
        issues.push(
          createHealthIssue({
            code: "MODEL390_RECONCILIATION_DIFF",
            severity: "ERROR",
            blocksFiling: true,
            title: `303 ↔ 390: ${d.label}`,
            description: `Operaciones: ${d.operationsAmount} · Desde 303: ${d.from303Amount} · Δ ${d.delta}`,
            model: "390",
            relatedModels: ["303"],
            year: ctx.year,
            evidence: { field: d.field, delta: d.delta },
          })
        );
      }
    } else if (rec.status === "MATCH") {
      checks.push(check("390_303_reconcile", "303 y 390 concilian", true, "390"));
    }
    if (rec.status === "REQUIRES_REVIEW") {
      issues.push(
        createHealthIssue({
          code: "MODEL390_REQUIRES_REVIEW",
          severity: "ERROR",
          blocksFiling: true,
          title: "Resumen anual 390 requiere revisión",
          description: "Hay datos incompletos (importaciones, prorrata, etc.) que impiden cerrar el resumen.",
          model: "390",
          year: ctx.year,
        })
      );
    }
    if (rec.status === "PROVISIONAL") {
      const prov = m390.annualFrom303.quarters?.filter((q) => q.provisional) ?? [];
      issues.push(
        createHealthIssue({
          code: "MODEL390_PROVISIONAL_303",
          severity: "WARNING",
          blocksFiling: false,
          title: "390 con trimestres 303 provisionales",
          description: `Trimestres sin presentar: ${prov.map((q) => `${q.quarter}T`).join(", ") || "—"}.`,
          model: "390",
          year: ctx.year,
        })
      );
    }

    if (ctx.presented390) {
      const cmp = compare390PresentedVsDraft(m390, ctx.presented390);
      if (
        cmp.presentedOutput != null &&
        !moneyEqual(cmp.presentedOutput, cmp.draftOutput)
      ) {
        issues.push(
          createHealthIssue({
            code: "FILING_DIVERGENCE",
            severity: "WARNING",
            blocksFiling: false,
            title: "390 presentado difiere del motor actual",
            description: `Devengado presentado vs motor: revisa cambios posteriores.`,
            model: "390",
            year: ctx.year,
            evidence: cmp,
          })
        );
      }
    }

    // DUA 303 = 390
    const opsImport =
      m390.annualFromOperations.breakdown.importCurrentVat +
      m390.annualFromOperations.breakdown.importInvestmentVat;
    const from303Import =
      m390.annualFrom303.breakdown.importCurrentVat +
      m390.annualFrom303.breakdown.importInvestmentVat;
    checks.push(
      check(
        "dua_303_390_match",
        "Importaciones 303 = 390",
        moneyEqual(opsImport, from303Import),
        "390",
        moneyEqual(opsImport, from303Import)
          ? undefined
          : `Ops ${opsImport} vs 303 ${from303Import}`
      )
    );

    modelStatuses.push({
      model: "390",
      label: "390",
      status:
        m390.filingObligation.status === "EXEMPT"
          ? m390.lastPeriodAnnualInfo.status === "COMPLETE"
            ? "READY"
            : "READY_WITH_WARNINGS"
          : rec.status === "MATCH"
            ? "READY"
            : "NOT_READY",
      presented: Boolean(ctx.presented390),
      obligation: m390.filingObligation.status,
    });
  }

  // ── 26. Legacy filings sin snapshot ──
  for (const f of ctx.filingsYear) {
    const raw = f.rawExtract as Record<string, unknown> | null;
    const hasSnapshot =
      raw &&
      (raw.model347Snapshot ||
        raw.model349Snapshot ||
        raw.model390Snapshot ||
        raw.source === "vexo-model390-engine");
    if (!hasSnapshot && ["347", "349", "390"].includes(f.modelType)) {
      issues.push(
        createHealthIssue({
          code: "LEGACY_FILING_LIMITED_AUDIT",
          severity: "INFO",
          blocksFiling: false,
          title: `${f.modelType} ${f.year} presentado sin snapshot estructurado`,
          description: "La comparación detallada será parcial.",
          model: f.modelType as FiscalModelType,
          year: f.year,
          quarter: f.quarter as FiscalQuarter | null,
          sourceType: "filing",
          sourceId: f.id,
        })
      );
    }
  }

  // ── Settings incomplete ──
  if (!ctx.settings?.nif?.trim()) {
    issues.push(
      createHealthIssue({
        code: "FISCAL_DATA_INCOMPLETE",
        severity: "WARNING",
        blocksFiling: false,
        title: "Falta NIF de empresa en Ajustes",
        description: "Configura los datos fiscales del emisor.",
        model: "HEALTH",
        year: ctx.year,
        href: "/settings",
      })
    );
  }

  // ── Extended cross-checks (Fase 8 cierre) ──
  for (const part of [
    run303CompensationChainChecks(ctx),
    run130YtdAndInvoicingChecks(ctx),
    runExpenses303Checks(ctx),
    run303349TraceChecks(ctx),
    runRectificationCrossChecks(ctx),
  ]) {
    issues.push(...part.issues);
    checks.push(...part.checks);
  }

  const obligations = runObligationChecks(ctx, issues);
  issues.push(...obligations.issues);
  checks.push(...obligations.checks);
  if (obligations.modelStatuses.length > 0) {
    modelStatuses.length = 0;
    modelStatuses.push(...obligations.modelStatuses);
  }

  return { issues, checks, modelStatuses };
}
