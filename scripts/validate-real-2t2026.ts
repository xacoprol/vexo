/**
 * Validación REAL 2T 2026 vs FiscalFiling AEAT (OCR gestoría).
 * Read-only. No migraciones. No cambia fórmulas.
 *
 * Bypass: CompanySettings carece de columnas Fase 9.x en Neon
 * → config 130 por defecto + lecturas selectivas.
 */
import { prisma } from "../lib/prisma";
import {
  quarterRange,
  yearRange,
  type FiscalQuarter,
} from "../lib/fiscal";
import { getPresentedFiling } from "../lib/fiscal-filings";
import { FISCAL_STATUS } from "../lib/invoice-fiscal-lifecycle";
import { moneyEqual, round2 } from "../lib/modelo-390/money";
import { EXPENSE_FISCAL_SELECT } from "../lib/fiscal-expense-select";
import { marketplaceIncomeNotInvoicedWhere } from "../lib/marketplace-income-storage";
import { buildModel303ChainFromRows } from "../lib/modelo-303/aggregate";
import { assembleModel130Chain } from "../lib/modelo-130/assemble";
import type { Model130Config } from "../lib/modelo-130/types";
import { buildModelo349Draft } from "../lib/fiscal-347-349";
import { fiscalFilingPeriodKey } from "../lib/gemini-fiscal-filing";

const YEAR = 2026;
const Q = 2 as FiscalQuarter;

function boxMap(boxes: { code: string; value: number }[] | undefined) {
  const m = new Map<string, number>();
  for (const b of boxes ?? []) {
    const raw = String(b.code);
    const n = Number(b.value) || 0;
    m.set(raw, n);
    m.set(raw.replace(/^0+/, "") || "0", n);
  }
  return m;
}

function getBox(m: Map<string, number>, code: string): number | null {
  if (m.has(code)) return m.get(code)!;
  const p = code.padStart(2, "0");
  if (m.has(p)) return m.get(p)!;
  return null;
}

function carryFromPresented303(presented: {
  result: unknown;
  boxes: unknown;
}): number {
  const boxes = Array.isArray(presented.boxes)
    ? (presented.boxes as { code: string; value: number }[])
    : [];
  const b87 = boxes.find(
    (b) => String(b.code) === "87" || String(b.code) === "087"
  );
  if (b87 != null && Number.isFinite(Number(b87.value))) {
    return round2(Math.max(0, Number(b87.value)));
  }
  const result = Number(presented.result) || 0;
  return result < 0 ? round2(Math.abs(result)) : 0;
}

async function main() {
  const { from, to } = quarterRange(YEAR, Q);
  const yFrom = yearRange(YEAR).from;

  const missing: string[] = [];
  for (const t of [
    "FiscalWithholding",
    "FiscalCounterparty",
    "BusinessPremisesLease",
  ]) {
    const r: { exists: boolean }[] = await prisma.$queryRawUnsafe(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='${t}') AS exists`
    );
    if (!r[0]?.exists) missing.push(t);
  }

  const cols: { column_name: string }[] = await prisma.$queryRaw`
    SELECT column_name::text AS column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='CompanySettings'`;
  const colSet = new Set(cols.map((c) => c.column_name));

  const [invQ, draftInv, anulInv, expQ, mktQ] = await Promise.all([
    prisma.invoice.count({
      where: {
        issueDate: { gte: from, lte: to },
        status: { not: "ANULADA" },
        fiscalStatus: FISCAL_STATUS.ISSUED,
      },
    }),
    prisma.invoice.count({
      where: {
        issueDate: { gte: from, lte: to },
        fiscalStatus: FISCAL_STATUS.DRAFT,
      },
    }),
    prisma.invoice.count({
      where: { issueDate: { gte: from, lte: to }, status: "ANULADA" },
    }),
    prisma.expense.count({ where: { issueDate: { gte: from, lte: to } } }),
    prisma.marketplaceIncome.count({
      where: {
        issueDate: { gte: from, lte: to },
        ...marketplaceIncomeNotInvoicedWhere,
      },
    }),
  ]);

  console.log("=== AUDIT ===");
  console.log(
    JSON.stringify(
      {
        period: "2T 2026",
        from,
        to,
        invQ,
        draftInv,
        anulInv,
        expQ,
        mktQ,
        missingPhase9Tables: missing,
        hasActivityStartYear: colSet.has("activityStartYear"),
        hasCensusModel111: colSet.has("censusModel111"),
      },
      null,
      2
    )
  );

  const [invoices, expenses, marketplace, assets, amortRows] =
    await Promise.all([
      prisma.invoice.findMany({
        where: {
          status: { not: "ANULADA" },
          fiscalStatus: FISCAL_STATUS.ISSUED,
          issueDate: { gte: yFrom, lte: to },
        },
        select: {
          id: true,
          fullNumber: true,
          issueDate: true,
          subtotal: true,
          vatAmount: true,
          irpfAmount: true,
          status: true,
          fiscalStatus: true,
          cashAccounting: true,
          vatOperationType: true,
          invoiceFiscalType: true,
          rectificationType: true,
          rectifiesInvoiceId: true,
          rectifiesInvoice: { select: { fullNumber: true } },
          lines: {
            select: { vatRate: true, lineSubtotal: true, lineVat: true },
          },
        },
      }),
      prisma.expense.findMany({
        where: { issueDate: { gte: yFrom, lte: to } },
        select: EXPENSE_FISCAL_SELECT,
      }),
      prisma.marketplaceIncome.findMany({
        where: {
          issueDate: { gte: yFrom, lte: to },
          ...marketplaceIncomeNotInvoicedWhere,
        },
        select: {
          id: true,
          issueDate: true,
          subtotal: true,
          vatAmount: true,
          vatRate: true,
          vatStatus: true,
          channel: true,
          orderId: true,
          invoiceId: true,
        },
      }),
      prisma.investmentAsset.findMany({
        where: { purchaseDate: { gte: yFrom, lte: to } },
        select: {
          id: true,
          description: true,
          purchaseDate: true,
          base: true,
          vatAmount: true,
          vatOperationType: true,
          expense: { select: { vatDeductiblePct: true } },
        },
      }),
      prisma.investmentAmortization.findMany({
        where: { year: YEAR },
      }),
    ]);

  // Prior year compensation from presented 4T 2025
  const priorPresented = await prisma.fiscalFiling.findUnique({
    where: { periodKey: fiscalFilingPeriodKey("303", YEAR - 1, 4) },
    select: { result: true, boxes: true },
  });
  const priorYearCompensation = priorPresented
    ? carryFromPresented303(priorPresented)
    : 0;

  // Presented carries for Q1 of 2026 (feeds Q2 box110)
  const presented303Rows = await prisma.fiscalFiling.findMany({
    where: { modelType: "303", year: YEAR, quarter: { not: null } },
    select: { quarter: true, result: true, boxes: true },
  });
  const presentedCarryByQuarter: Partial<Record<1 | 2 | 3 | 4, number>> = {};
  for (const r of presented303Rows) {
    if (r.quarter == null) continue;
    presentedCarryByQuarter[r.quarter as 1 | 2 | 3 | 4] =
      carryFromPresented303(r);
  }

  const presented130Rows = await prisma.fiscalFiling.findMany({
    where: { modelType: "130", year: YEAR, quarter: { not: null } },
    select: { quarter: true, result: true, boxes: true },
  });
  const presented130: Partial<
    Record<
      FiscalQuarter,
      { result: number; boxes: { code: string; value: number }[] }
    >
  > = {};
  for (const r of presented130Rows) {
    if (r.quarter == null) continue;
    presented130[r.quarter as FiscalQuarter] = {
      result: Number(r.result),
      boxes: Array.isArray(r.boxes)
        ? (r.boxes as { code: string; value: number }[])
        : [],
    };
  }

  const config130: Model130Config = {
    irpfDirectEstimationMode: "NORMAL",
    previousYearNetIncomeMode: "UNKNOWN",
    previousYearNetIncomeFor130Reduction: null,
    irpf130HousingDeduction: "NO",
    agriculturalActivities130: "NO",
    irregularIncome130Status: "NONE",
    fiscalRegime: "130",
    activityKind130: "UNKNOWN",
    priorYearWithholdingPct130: null,
    activityStartYear: null,
    hasCashAccountingInvoices: invoices.some((i) => i.cashAccounting),
  };

  const chain303 = buildModel303ChainFromRows({
    year: YEAR,
    invoices: invoices as never,
    expenses: expenses as never,
    marketplace: marketplace as never,
    assets: assets.map((a) => ({
      id: a.id,
      description: a.description,
      purchaseDate: a.purchaseDate,
      base: a.base,
      vatAmount: a.vatAmount,
      vatOperationType: a.vatOperationType,
      vatDeductiblePct: a.expense?.vatDeductiblePct ?? 100,
    })) as never,
    priorYearCompensation,
    presentedCarryByQuarter,
    quarterRange,
  });

  const chain130 = assembleModel130Chain({
    year: YEAR,
    config: config130,
    invoices: invoices as never,
    expenses: expenses as never,
    marketplace: marketplace as never,
    amortRows: amortRows.map((r) => ({
      assetId: r.assetId,
      year: r.year,
      quarter: r.quarter as FiscalQuarter,
      amount: Number(r.amount),
      label: undefined,
    })),
    presented: presented130,
  });

  let draft349: Awaited<ReturnType<typeof buildModelo349Draft>> | null = null;
  let draft349Error: string | null = null;
  try {
    draft349 = await buildModelo349Draft(YEAR, Q);
  } catch (e) {
    draft349Error = String((e as Error).message).slice(0, 400);
  }

  const [p130, p303, p349] = await Promise.all([
    getPresentedFiling("130", YEAR, Q),
    getPresentedFiling("303", YEAR, Q),
    getPresentedFiling("349", YEAR, Q),
  ]);

  const m130 = chain130[Q];
  const m303 = chain303[Q];
  const vexo130Result = round2(Number(m130.result ?? m130.boxes.box19 ?? 0));
  const vexo303Result = round2(Number(m303.result ?? m303.boxes.box71 ?? 0));
  const vexo349 = draft349
    ? draft349.hasOps
      ? round2(
          Object.values(draft349.totalsByKey ?? {}).reduce(
            (s, v) => s + (Number(v) || 0),
            0
          )
        )
      : 0
    : null;

  // Detail for explanation
  const detail = {
    m130: {
      result: m130.result,
      box01: m130.boxes.box01,
      box02: m130.boxes.box02,
      box03: m130.boxes.box03,
      box05: m130.boxes.box05,
      box07: m130.boxes.box07,
      box12: m130.boxes.box12,
      box13: m130.boxes.box13,
      box16: m130.boxes.box16,
      box19: m130.boxes.box19,
      warnings: (m130 as { warnings?: unknown }).warnings ?? null,
    },
    m303: {
      result: m303.result,
      box27: m303.boxes.box27,
      box45: m303.boxes.box45,
      box46: m303.boxes.box46,
      box66: m303.boxes.box66,
      box69: m303.boxes.box69,
      box71: m303.boxes.box71,
      box87: m303.boxes.box87,
    },
    m349: draft349
      ? {
          hasOps: draft349.hasOps,
          totalsByKey: draft349.totalsByKey,
          opCount: draft349.operations?.length ?? 0,
          error: draft349Error,
        }
      : { error: draft349Error },
    presentedRaw: {
      "130": p130
        ? {
            result: p130.result,
            source: p130.sourceFileName,
            hasSnapshot: !!(p130 as { model130Snapshot?: unknown }).model130Snapshot,
            rawKeys: p130.rawExtract ? Object.keys(p130.rawExtract as object) : [],
            ocrResult: (p130.rawExtract as { result?: number } | null)?.result ?? null,
            ocrBoxes: (p130.rawExtract as { boxes?: unknown } | null)?.boxes ?? null,
          }
        : null,
      "303": p303
        ? {
            result: p303.result,
            source: p303.sourceFileName,
            hasSnapshot: !!(p303 as { model303Snapshot?: unknown }).model303Snapshot,
            ocrResult: (p303.rawExtract as { result?: number } | null)?.result ?? null,
            ocrBoxes: (p303.rawExtract as { boxes?: unknown } | null)?.boxes ?? null,
          }
        : null,
      "349": p349
        ? {
            result: p349.result,
            source: p349.sourceFileName,
            hasSnapshot: !!(p349 as { model349Snapshot?: unknown }).model349Snapshot,
            ocrResult: (p349.rawExtract as { result?: number } | null)?.result ?? null,
            ocrBoxes: (p349.rawExtract as { boxes?: unknown } | null)?.boxes ?? null,
          }
        : null,
    },
  };
  console.log("=== DETAIL ===");
  console.log(JSON.stringify(detail, null, 2));

  function classify(
    model: string,
    presentado: number | null,
    vexo: number | null,
    extra?: string
  ) {
    if (presentado == null && vexo == null) {
      return {
        estado: "DATO FALTANTE/INCORRECTO",
        explicacion: extra ?? "Sin datos",
        diff: null as number | null,
      };
    }
    if (presentado == null) {
      return {
        estado: "SIN FILING",
        explicacion: extra ?? "No hay FiscalFiling presentado",
        diff: null,
      };
    }
    if (vexo == null) {
      return {
        estado: "DATO FALTANTE/INCORRECTO",
        explicacion: extra ?? "Motor no disponible",
        diff: null,
      };
    }
    const diff = round2(vexo - presentado);
    if (moneyEqual(diff, 0)) {
      return { estado: "OK", explicacion: "Coincide", diff: 0 };
    }
    return {
      estado: "FILING LEGACY SIN DETALLE",
      explicacion:
        (extra ?? "") +
        ` Delta ${diff}€. Filing OCR gestoría sin model*Snapshot estructurado.`,
      diff,
    };
  }

  const rows = [
    {
      model: "130",
      presentado: p130?.result ?? null,
      vexo: vexo130Result,
      ...classify("130", p130?.result ?? null, vexo130Result),
      source: p130?.sourceFileName,
    },
    {
      model: "303",
      presentado: p303?.result ?? null,
      vexo: vexo303Result,
      ...classify("303", p303?.result ?? null, vexo303Result),
      source: p303?.sourceFileName,
    },
    {
      model: "349",
      presentado: p349?.result ?? null,
      vexo: vexo349,
      ...classify(
        "349",
        p349?.result ?? null,
        vexo349,
        draft349Error
          ? `349 error: ${draft349Error}. `
          : "VEXO=suma bases totalesByKey; OCR.result puede ser otra magnitud. "
      ),
      source: p349?.sourceFileName,
    },
    {
      model: "111",
      presentado: null,
      vexo: null,
      ...classify(
        "111",
        null,
        null,
        "Sin FiscalFiling 111. Tablas FiscalWithholding no migradas en Neon."
      ),
    },
    {
      model: "115",
      presentado: null,
      vexo: null,
      ...classify(
        "115",
        null,
        null,
        "Sin FiscalFiling 115. Tablas lease/withholding no migradas en Neon."
      ),
    },
  ];

  console.log("\n=== MODELO | PRESENTADO | VEXO | DIFF | ESTADO ===");
  console.log(JSON.stringify(rows, null, 2));

  // Prefer OCR boxes from rawExtract when FilingBox[] is empty/partial
  const ocr130 = Array.isArray(
    (p130?.rawExtract as { boxes?: unknown } | null)?.boxes
  )
    ? ((p130!.rawExtract as { boxes: { code: string; value: number }[] }).boxes)
    : p130?.boxes ?? [];
  const ocr303 = Array.isArray(
    (p303?.rawExtract as { boxes?: unknown } | null)?.boxes
  )
    ? ((p303!.rawExtract as { boxes: { code: string; value: number }[] }).boxes)
    : p303?.boxes ?? [];
  const ocr349 = Array.isArray(
    (p349?.rawExtract as { boxes?: unknown } | null)?.boxes
  )
    ? ((p349!.rawExtract as { boxes: { code: string; value: number }[] }).boxes)
    : p349?.boxes ?? [];

  const p130m = boxMap(ocr130);
  const p303m = boxMap(ocr303);

  const e130 = boxMap(
    Object.entries(m130.boxes as Record<string, number>).map(([k, v]) => ({
      code: k.replace(/^box/, "").padStart(2, "0"),
      value: Number(v),
    }))
  );
  const e303Final = boxMap(
    Object.entries(m303.boxes as unknown as Record<string, number>).map(
      ([k, v]) => ({
        code: k.replace(/^box/, "").padStart(2, "0"),
        value: Number(v),
      })
    )
  );

  const codes130 = [
    "01",
    "02",
    "03",
    "04",
    "05",
    "06",
    "07",
    "12",
    "13",
    "14",
    "15",
    "16",
    "17",
    "18",
    "19",
  ];
  const codes303 = [
    "07",
    "09",
    "10",
    "11",
    "27",
    "28",
    "29",
    "36",
    "37",
    "45",
    "46",
    "66",
    "69",
    "71",
    "78",
    "87",
    "110",
  ];

  console.log("\n=== 130 CASILLAS ===");
  console.log(
    JSON.stringify(
      codes130
        .map((c) => {
          const p = getBox(p130m, c);
          const e = getBox(e130, c);
          if (p == null && (e == null || e === 0)) return null;
          const delta = p != null && e != null ? round2(e - p) : null;
          return {
            code: c,
            presentado: p,
            vexo: e,
            delta,
            match: delta != null ? moneyEqual(delta, 0) : false,
          };
        })
        .filter(Boolean),
      null,
      2
    )
  );

  console.log("\n=== 303 CASILLAS ===");
  console.log(
    JSON.stringify(
      codes303
        .map((c) => {
          const p = getBox(p303m, c);
          const e = getBox(e303Final, c);
          if (p == null && (e == null || e === 0)) return null;
          const delta = p != null && e != null ? round2(e - p) : null;
          return {
            code: c,
            presentado: p,
            vexo: e,
            delta,
            match: delta != null ? moneyEqual(delta, 0) : false,
          };
        })
        .filter(Boolean),
      null,
      2
    )
  );

  // Trace / Q1 / 349 ops
  const p130q1 = await getPresentedFiling("130", YEAR, 1);
  const p303q1 = await getPresentedFiling("303", YEAR, 1);
  const trace = (m130 as { trace?: { sourceType: string; amount: number; description: string }[] })
    .trace;
  const bySrc: Record<string, number> = {};
  for (const t of trace ?? []) {
    bySrc[t.sourceType] = round2((bySrc[t.sourceType] ?? 0) + Number(t.amount));
  }

  console.log("\n=== ENGINE META ===");
  console.log(
    JSON.stringify(
      {
        config130,
        priorYearCompensation,
        presentedCarryByQuarter,
        q1_130: p130q1
          ? {
              result: p130q1.result,
              incomeBase: p130q1.incomeBase,
              expensesBase: p130q1.expensesBase,
              boxes: Array.isArray(
                (p130q1.rawExtract as { boxes?: unknown })?.boxes
              )
                ? (p130q1.rawExtract as { boxes: unknown }).boxes
                : p130q1.boxes,
            }
          : null,
        q1_303: p303q1
          ? { result: p303q1.result, boxes: p303q1.boxes?.slice?.(0, 8) }
          : null,
        m303: {
          result: m303.result,
          outcome: m303.outcome,
          carryForward: m303.carryForward,
          priorCompensationPending: m303.priorCompensationPending,
          box07: m303.boxes.box07,
          box09: m303.boxes.box09,
          box10: m303.boxes.box10,
          box11: m303.boxes.box11,
          box28: m303.boxes.box28,
          box29: m303.boxes.box29,
          box36: m303.boxes.box36,
          box37: m303.boxes.box37,
          warnings: m303.warnings?.slice(0, 20),
        },
        m130TraceBySource: bySrc,
        m130Warnings: m130.warnings,
        draft349: draft349
          ? {
              hasOps: draft349.hasOps,
              totalOperations: draft349.totalOperations,
              incompleteVatId: draft349.incompleteVatId,
              totalsByKey: draft349.totalsByKey,
              ops: draft349.operations?.map((o) => ({
                key: o.key,
                vatId: o.vatId,
                amount: o.amount,
                name: o.name,
              })),
              warnings: draft349.warnings?.slice(0, 10),
            }
          : { error: draft349Error },
        ocr349,
      },
      null,
      2
    )
  );

  // Health / close blocked by schema drift
  console.log("\n=== HEALTH / CLOSE ===");
  console.log(
    JSON.stringify({
      status: "INCOMPLETE",
      reason:
        "Neon sin migraciones Fase 9.1–9.5 (FiscalWithholding, census columns). buildFiscalHealthCheck /fiscal/close no pueden ejecutarse hasta migrate deploy.",
      blockedBy: missing,
    })
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
