import { prisma } from "@/lib/prisma";
import {
  fiscalFilingPeriodKey,
  type FiscalModelType,
  type FilingBox,
} from "@/lib/gemini-fiscal-filing";

export type PresentedFilingView = {
  result: number;
  incomeBase: number | null;
  expensesBase: number | null;
  vatRepercutida: number | null;
  vatDeductible: number | null;
  boxes: FilingBox[];
  sourceFileName: string | null;
  notes: string | null;
  year: number;
  quarter: number | null;
  modelType: string;
};

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function parseBoxes(raw: unknown): FilingBox[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((b) => {
    const o = b as Record<string, unknown>;
    return {
      code: String(o.code ?? "—"),
      label: String(o.label ?? ""),
      value: Number(o.value) || 0,
    };
  });
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function getPresentedFiling(
  modelType: FiscalModelType,
  year: number,
  quarter: number | null
): Promise<PresentedFilingView | null> {
  const periodKey = fiscalFilingPeriodKey(modelType, year, quarter);
  const row = await prisma.fiscalFiling.findUnique({ where: { periodKey } });
  if (!row) return null;
  return {
    result: Number(row.result),
    incomeBase: numOrNull(row.incomeBase),
    expensesBase: numOrNull(row.expensesBase),
    vatRepercutida: numOrNull(row.vatRepercutida),
    vatDeductible: numOrNull(row.vatDeductible),
    boxes: parseBoxes(row.boxes),
    sourceFileName: row.sourceFileName,
    notes: row.notes,
    year: row.year,
    quarter: row.quarter,
    modelType: row.modelType,
  };
}

export async function listPresentedForYear(year: number) {
  return prisma.fiscalFiling.findMany({
    where: { year },
    orderBy: [{ modelType: "asc" }, { quarter: "asc" }],
  });
}

export type OfficialPeriodHistory = {
  label: string;
  quarter: number | null;
  /** Preferido: 130; si no, 390 anual */
  incomeBase: number | null;
  expensesBase: number | null;
  incomeSource: string | null;
  expensesSource: string | null;
  vatRepercutida: number | null;
  vatDeductible: number | null;
  result303: number | null;
  result130: number | null;
  result390: number | null;
};

export type OfficialYearHistory = {
  year: number;
  /** Suma T de 130, o 390 si no hay trimestres */
  incomeBase: number | null;
  expensesBase: number | null;
  incomeSource: string;
  expensesSource: string;
  vatRepercutida: number | null;
  vatDeductible: number | null;
  periods: OfficialPeriodHistory[];
  hasData: boolean;
};

/**
 * Histórico oficial de ingresos/gastos a partir de modelos presentados.
 * Prioridad ingresos/gastos: 130 trimestral → 390 anual.
 * IVA: 303 trimestral → 390.
 */
export async function buildOfficialYearHistory(
  year: number
): Promise<OfficialYearHistory> {
  const rows = await listPresentedForYear(year);

  const by130 = new Map(
    rows
      .filter((r) => r.modelType === "130" && r.quarter != null)
      .map((r) => [r.quarter!, r])
  );
  const by303 = new Map(
    rows
      .filter((r) => r.modelType === "303" && r.quarter != null)
      .map((r) => [r.quarter!, r])
  );
  const row390 = rows.find((r) => r.modelType === "390") ?? null;

  const periods: OfficialPeriodHistory[] = ([1, 2, 3, 4] as const).map((q) => {
    const f130 = by130.get(q);
    const f303 = by303.get(q);
    return {
      label: `${q}T ${year}`,
      quarter: q,
      incomeBase: numOrNull(f130?.incomeBase),
      expensesBase: numOrNull(f130?.expensesBase),
      incomeSource: f130?.incomeBase != null ? `130 ${q}T` : null,
      expensesSource: f130?.expensesBase != null ? `130 ${q}T` : null,
      vatRepercutida: numOrNull(f303?.vatRepercutida),
      vatDeductible: numOrNull(f303?.vatDeductible),
      result303: f303 ? Number(f303.result) : null,
      result130: f130 ? Number(f130.result) : null,
      result390: null,
    };
  });

  // 130 bases son YTD: usar el último trimestre disponible (no sumar T1+…+T4)
  const lastWithIncome = [...periods].reverse().find((p) => p.incomeBase != null);
  const lastWithExpenses = [...periods]
    .reverse()
    .find((p) => p.expensesBase != null);

  let incomeBase: number | null = lastWithIncome?.incomeBase ?? null;
  let expensesBase: number | null = lastWithExpenses?.expensesBase ?? null;
  let incomeSource = lastWithIncome
    ? `130 ${lastWithIncome.quarter}T (YTD)`
    : "";
  let expensesSource = lastWithExpenses
    ? `130 ${lastWithExpenses.quarter}T (YTD)`
    : "";

  if (incomeBase == null && row390?.incomeBase != null) {
    incomeBase = Number(row390.incomeBase);
    incomeSource = "390 anual";
  }
  if (expensesBase == null && row390?.expensesBase != null) {
    expensesBase = Number(row390.expensesBase);
    expensesSource = "390 anual";
  }

  const sumVatRep = periods.reduce(
    (s, p) => (p.vatRepercutida != null ? round2(s + p.vatRepercutida) : s),
    0
  );
  const sumVatDed = periods.reduce(
    (s, p) => (p.vatDeductible != null ? round2(s + p.vatDeductible) : s),
    0
  );
  const hasVatQ = periods.some(
    (p) => p.vatRepercutida != null || p.vatDeductible != null
  );

  let vatRepercutida: number | null = hasVatQ
    ? periods.some((p) => p.vatRepercutida != null)
      ? sumVatRep
      : null
    : null;
  let vatDeductible: number | null = hasVatQ
    ? periods.some((p) => p.vatDeductible != null)
      ? sumVatDed
      : null
    : null;

  if (vatRepercutida == null && row390?.vatRepercutida != null) {
    vatRepercutida = Number(row390.vatRepercutida);
  }
  if (vatDeductible == null && row390?.vatDeductible != null) {
    vatDeductible = Number(row390.vatDeductible);
  }

  if (row390) {
    periods.push({
      label: `Año ${year} (390)`,
      quarter: null,
      incomeBase: numOrNull(row390.incomeBase),
      expensesBase: numOrNull(row390.expensesBase),
      incomeSource: row390.incomeBase != null ? "390" : null,
      expensesSource: row390.expensesBase != null ? "390" : null,
      vatRepercutida: numOrNull(row390.vatRepercutida),
      vatDeductible: numOrNull(row390.vatDeductible),
      result303: null,
      result130: null,
      result390: Number(row390.result),
    });
  }

  const hasData =
    incomeBase != null ||
    expensesBase != null ||
    vatRepercutida != null ||
    vatDeductible != null ||
    rows.length > 0;

  return {
    year,
    incomeBase,
    expensesBase,
    incomeSource: incomeSource || "—",
    expensesSource: expensesSource || "—",
    vatRepercutida,
    vatDeductible,
    periods,
    hasData,
  };
}
