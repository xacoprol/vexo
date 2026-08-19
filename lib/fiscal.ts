import { endOfYear, startOfYear } from "date-fns";
import { prisma } from "@/lib/prisma";
import { fiscalFilingPeriodKey } from "@/lib/gemini-fiscal-filing";
import {
  sumAmortizationYtd,
  type AmortizationPeriodInput,
} from "@/lib/investment-amortization";

export type FiscalQuarter = 1 | 2 | 3 | 4;

export type VatBucket = {
  rate: number;
  base: number;
  quota: number;
};

export type ModeloBoxes = {
  boxes: { code: string; label: string; value: number }[];
  result: number;
  /** Saldo a compensar que arrastra al siguiente periodo (303). */
  carryForward?: number;
};

export type FiscalPeriodSummary = {
  year: number;
  quarter: FiscalQuarter;
  from: Date;
  to: Date;
  label: string;
  issued: {
    count: number;
    vatBuckets: VatBucket[];
    baseSujeta: number;
    quotaRepercutida: number;
    baseExenta: number;
    baseIntracom: number;
    baseExport: number;
    baseCanarias: number;
    baseMarketplaceCollected: number;
    irpfWithheld: number;
    incomeBase: number;
    invoiceIncomeBase: number;
    marketplaceCount: number;
    marketplaceIncomeBase: number;
  };
  expenses: {
    count: number;
    /** Base IRPF de gastos corrientes (sin bienes de inversión; esos van por amortización) */
    base: number;
    /** IVA soportado compras interiores (casillas 28/29) */
    vatDeductible: number;
    /** Adquisiciones intracomunitarias: base (10 / 36) */
    aibBase: number;
    /** Adquisiciones intracomunitarias: cuota autorrepercutida (11 / 37) */
    aibQuota: number;
    /** Servicios desde terceros países (EEUU…): base (16) */
    importServiceBase: number;
    /** Servicios extracomunitarios: cuota ISP (17) */
    importServiceQuota: number;
    total: number;
  };
  modelo303: ModeloBoxes;
  modelo130: ModeloBoxes;
};

export type FiscalQuarterSlice = {
  quarter: FiscalQuarter;
  label: string;
  incomeBase: number;
  expensesBase: number;
  irpfWithheld: number;
  modelo303Result: number;
  modelo130Result: number;
};

export type FiscalYearSummary = {
  year: number;
  from: Date;
  to: Date;
  label: string;
  issued: FiscalPeriodSummary["issued"];
  expenses: FiscalPeriodSummary["expenses"];
  modelo303: ModeloBoxes;
  modelo130: ModeloBoxes;
  /** Borrador orientativo Modelo 390 (declaración-resumen anual IVA) */
  modelo390: ModeloBoxes;
  /** Suma de resultados 303 de cada trimestre (a ingresar neto del año) */
  ivaNetYear: number;
  /** Suma de ingresos a cuenta 130 (solo resultados positivos de cada T) */
  irpfPaymentsYear: number;
  quarters: FiscalQuarterSlice[];
};

type InvoiceRow = {
  issueDate: Date;
  subtotal: unknown;
  vatAmount: unknown;
  irpfAmount: unknown;
  vatOperationType: string | null;
  lines: {
    vatRate: number;
    lineSubtotal: unknown;
    lineVat: unknown;
  }[];
};

type ExpenseRow = {
  issueDate: Date;
  subtotal: unknown;
  vatAmount: unknown;
  vatRate: number;
  total: unknown;
  vatOperationType: string | null;
  /**
   * Si false: no computa en IRPF (130) ni en IVA soportado interior (303).
   * AIB (intracom) y servicios extracomunitarios se declaran siempre en el 303.
   */
  deductible: boolean;
  /** IVA interior → casillas 30/31 vía InvestmentAsset; no entra en 28/29 */
  isInvestment: boolean;
};

type MarketplaceRow = {
  issueDate: Date;
  subtotal: unknown;
  vatAmount: unknown;
  vatRate: number;
  vatStatus: string | null;
};

/** IVA de bienes de inversión interiores en el trimestre de compra → 30/31. */
type AssetVatRow = {
  purchaseDate: Date | null;
  base: unknown;
  vatAmount: unknown;
  vatOperationType?: string | null;
};

function parseFilingBoxes(
  raw: unknown
): { code: string; value: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((b) => {
    const o = b as Record<string, unknown>;
    return {
      code: String(o.code ?? "").trim(),
      value: Number(o.value) || 0,
    };
  });
}

/** Saldo a compensar que arrastra al siguiente periodo desde un 303 presentado. */
function carryFromPresented303(row: {
  result: unknown;
  boxes: unknown;
}): number {
  const result = Number(row.result);
  const boxes = parseFilingBoxes(row.boxes);
  const box87 = boxes.find((b) => b.code === "87");
  if (box87) {
    return round2(
      Math.max(0, box87.value) + (result < 0 ? Math.max(0, -result) : 0)
    );
  }
  return round2(Math.max(0, -result));
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function quarterRange(
  year: number,
  quarter: FiscalQuarter
): { from: Date; to: Date } {
  const startMonth = (quarter - 1) * 3;
  const from = new Date(year, startMonth, 1, 0, 0, 0, 0);
  const to = new Date(year, startMonth + 3, 0, 23, 59, 59, 999);
  return { from, to };
}

export function yearRange(year: number): { from: Date; to: Date } {
  const from = startOfYear(new Date(year, 0, 1));
  const to = endOfYear(new Date(year, 0, 1));
  return { from, to };
}

export function currentFiscalPeriod(now = new Date()): {
  year: number;
  quarter: FiscalQuarter;
} {
  const m = now.getMonth(); // 0–11
  const y = now.getFullYear();
  // En mes de plazo (ene/abr/jul/oct) hasta día 20: trimestre que vence.
  // Fuera de esa ventana: trimestre civil en curso (para ir preparando).
  if (m === 0 && now.getDate() <= 20) return { year: y - 1, quarter: 4 };
  if (m === 3 && now.getDate() <= 20) return { year: y, quarter: 1 };
  if (m === 6 && now.getDate() <= 20) return { year: y, quarter: 2 };
  if (m === 9 && now.getDate() <= 20) return { year: y, quarter: 3 };

  if (m <= 2) return { year: y, quarter: 1 };
  if (m <= 5) return { year: y, quarter: 2 };
  if (m <= 8) return { year: y, quarter: 3 };
  return { year: y, quarter: 4 };
}

export function parseFiscalPeriod(sp: {
  year?: string;
  q?: string;
}): { year: number; quarter: FiscalQuarter } {
  const now = currentFiscalPeriod();
  const year = parseInt(sp.year ?? "", 10);
  const q = parseInt(sp.q ?? "", 10);
  return {
    year: Number.isFinite(year) && year >= 2000 && year <= 2100 ? year : now.year,
    quarter:
      q === 1 || q === 2 || q === 3 || q === 4 ? (q as FiscalQuarter) : now.quarter,
  };
}

export function parseFiscalYear(sp: { year?: string }): number {
  const nowY = new Date().getFullYear();
  const year = parseInt(sp.year ?? "", 10);
  return Number.isFinite(year) && year >= 2000 && year <= 2100 ? year : nowY;
}

export const EXPENSE_CATEGORIES = [
  { id: "SUMINISTROS", label: "Suministros" },
  { id: "SOFTWARE", label: "Software / SaaS" },
  { id: "MATERIAL", label: "Material" },
  { id: "DIETAS", label: "Dietas / desplazamiento" },
  { id: "PROFESIONALES", label: "Servicios profesionales" },
  { id: "OTROS", label: "Otros" },
] as const;

/** Tipo de IVA en gastos (compras). */
export const EXPENSE_VAT_OPERATION_TYPES = [
  { value: "INTERIOR", label: "Compra interior (España)" },
  {
    value: "INTRACOMUNITARIA",
    label: "Intracomunitaria UE (inversión sujeto pasivo)",
  },
  {
    value: "SERVICIO_EXTRACOMUNITARIO",
    label: "Servicio extracom. (EEUU, factura 0 % IVA)",
  },
] as const;

export type ExpenseVatOperationType =
  (typeof EXPENSE_VAT_OPERATION_TYPES)[number]["value"];

export function parseExpenseVatOperationType(
  raw: unknown
): ExpenseVatOperationType {
  const v = String(raw ?? "INTERIOR").toUpperCase().trim();
  if (
    v === "SERVICIO_EXTRACOMUNITARIO" ||
    v === "IMPORTACION_SERVICIOS" ||
    v === "EXTRACOMUNITARIA" ||
    v === "TERCER_PAIS" ||
    v === "EEUU" ||
    v === "USA" ||
    v === "IMPORT_SERVICE"
  ) {
    return "SERVICIO_EXTRACOMUNITARIO";
  }
  if (v === "INTRACOMUNITARIA" || v === "INTRACOM" || v === "AIB") {
    return "INTRACOMUNITARIA";
  }
  // "ISP" solo: sin contexto UE → servicio extracom (p. ej. Cursor EEUU)
  if (v === "ISP") return "SERVICIO_EXTRACOMUNITARIO";
  return "INTERIOR";
}

export function isExpenseIntracom(op: string | null | undefined): boolean {
  return parseExpenseVatOperationType(op) === "INTRACOMUNITARIA";
}

export function isExpenseImportService(op: string | null | undefined): boolean {
  return parseExpenseVatOperationType(op) === "SERVICIO_EXTRACOMUNITARIO";
}

/** Compras con inversión del sujeto pasivo (UE o terceros países). */
export function isExpenseReverseCharge(op: string | null | undefined): boolean {
  return isExpenseIntracom(op) || isExpenseImportService(op);
}

function addBucket(
  map: Map<number, VatBucket>,
  rate: number,
  base: number,
  quota: number
) {
  const cur = map.get(rate) ?? { rate, base: 0, quota: 0 };
  cur.base = round2(cur.base + base);
  cur.quota = round2(cur.quota + quota);
  map.set(rate, cur);
}

function inRange(d: Date, from: Date, to: Date): boolean {
  return d >= from && d <= to;
}

type Modelo303Input = {
  vatBuckets: VatBucket[];
  expenseBase: number;
  expenseVat: number;
  /** Bienes de inversión (casillas 30/31) */
  investmentBase?: number;
  investmentVat?: number;
  /** Adquisiciones intracomunitarias (compras UE) */
  aibBase?: number;
  aibQuota?: number;
  /** Servicios recibidos desde terceros países (casillas 16/17) */
  importServiceBase?: number;
  importServiceQuota?: number;
  baseExenta: number;
  baseIntracom: number;
  baseExport: number;
  baseCanarias: number;
  baseMarketplaceCollected: number;
  /** Casilla 110: saldo a compensar de periodos anteriores */
  priorCompensation?: number;
};

/**
 * Borrador Modelo 303 (régimen general) alineado con instrucciones AEAT 2025/2026.
 * result = casilla 69 (resultado de la autoliquidación tras aplicar compensaciones).
 */
function buildModelo303(input: Modelo303Input): ModeloBoxes {
  const {
    vatBuckets,
    expenseBase,
    expenseVat,
    investmentBase = 0,
    investmentVat = 0,
    aibBase = 0,
    aibQuota = 0,
    importServiceBase = 0,
    importServiceQuota = 0,
    baseExenta,
    baseIntracom,
    baseExport,
    baseCanarias,
    baseMarketplaceCollected,
    priorCompensation = 0,
  } = input;

  const bucketAt = (rate: number) =>
    vatBuckets.find((b) => Math.abs(b.rate - rate) < 0.01) ?? {
      rate,
      base: 0,
      quota: 0,
    };
  const b4 = bucketAt(4);
  const b10 = bucketAt(10);
  const b21 = bucketAt(21);
  const quotaRepercutida = round2(
    vatBuckets.reduce((s, b) => s + b.quota, 0)
  );
  const otherBase = round2(
    vatBuckets
      .filter((b) => ![4, 10, 21].some((r) => Math.abs(b.rate - r) < 0.01))
      .reduce((s, b) => s + b.base, 0)
  );
  const otherQuota = round2(
    vatBuckets
      .filter((b) => ![4, 10, 21].some((r) => Math.abs(b.rate - r) < 0.01))
      .reduce((s, b) => s + b.quota, 0)
  );

  const box10 = round2(Math.max(0, aibBase));
  const box11 = round2(Math.max(0, aibQuota));
  const box16 = round2(Math.max(0, importServiceBase));
  const box17 = round2(Math.max(0, importServiceQuota));
  const box27 = round2(quotaRepercutida + box11 + box17);
  const box28 = round2(Math.max(0, expenseBase));
  const box29 = round2(Math.max(0, expenseVat));
  const box30 = round2(Math.max(0, investmentBase));
  const box31 = round2(Math.max(0, investmentVat));
  const box36 = box10;
  const box37 = box11;
  const box45 = round2(box29 + box31 + box37);
  const box46 = round2(box27 - box45);

  const box110 = round2(Math.max(0, priorCompensation));
  const box78 = round2(Math.min(box110, Math.max(0, box46)));
  const box87 = round2(box110 - box78);
  const box69 = round2(box46 - box78);
  // Saldo que arrastra al siguiente periodo: lo no aplicado de 110 + resultado negativo de este T
  const carryForward = round2(box87 + (box69 < 0 ? -box69 : 0));

  // 60: exportaciones + asimiladas (incl. envíos definitivos a Canarias, Ceuta, Melilla)
  const box60 = round2(baseExport + baseCanarias);

  return {
    boxes: [
      { code: "01", label: "Base imponible 4 %", value: b4.base },
      { code: "03", label: "Cuota 4 %", value: b4.quota },
      { code: "04", label: "Base imponible 10 %", value: b10.base },
      { code: "06", label: "Cuota 10 %", value: b10.quota },
      { code: "07", label: "Base imponible 21 %", value: b21.base },
      { code: "09", label: "Cuota 21 %", value: b21.quota },
      {
        code: "10",
        label: "Adquisiciones intracomunitarias (base)",
        value: box10,
      },
      {
        code: "11",
        label: "Adquisiciones intracomunitarias (cuota)",
        value: box11,
      },
      {
        code: "16",
        label: "Adquisiciones servicios terceros países (base)",
        value: box16,
      },
      {
        code: "17",
        label: "Adquisiciones servicios terceros países (cuota)",
        value: box17,
      },
      ...(otherQuota > 0 || otherBase > 0
        ? [
            {
              code: "revisar",
              label: "Otras bases sujetas (tipos distintos) — revisar en sede",
              value: otherBase,
            },
            {
              code: "revisar",
              label: "Otras cuotas repercutidas — revisar en sede",
              value: otherQuota,
            },
          ]
        : []),
      { code: "27", label: "Total cuota devengada", value: box27 },
      {
        code: "28",
        label: "Base cuotas soportadas (ops. interiores corrientes)",
        value: box28,
      },
      {
        code: "29",
        label: "Cuota deducible (gastos corrientes)",
        value: box29,
      },
      {
        code: "30",
        label: "Base bienes de inversión (ops. interiores)",
        value: box30,
      },
      {
        code: "31",
        label: "Cuota deducible bienes de inversión",
        value: box31,
      },
      {
        code: "36",
        label: "IVA deducible adquisiciones intracomunitarias (base)",
        value: box36,
      },
      {
        code: "37",
        label: "IVA deducible adquisiciones intracomunitarias (cuota)",
        value: box37,
      },
      { code: "45", label: "Total IVA deducible", value: box45 },
      {
        code: "46",
        label: "Resultado régimen general (27 − 45)",
        value: box46,
      },
      {
        code: "59",
        label: "Entregas intracomunitarias (base)",
        value: round2(baseIntracom),
      },
      {
        code: "60",
        label: "Exportaciones y asimiladas (incl. Canarias)",
        value: box60,
      },
      {
        code: "revisar",
        label: "Otras operaciones exentas — revisar en sede",
        value: round2(baseExenta),
      },
      {
        code: "123",
        label: "No sujetas OSS / ventanilla única (marketplace)",
        value: round2(baseMarketplaceCollected),
      },
      {
        code: "110",
        label: "Cuotas a compensar de periodos anteriores",
        value: box110,
      },
      {
        code: "78",
        label: "Cuotas a compensar aplicadas este periodo",
        value: box78,
      },
      {
        code: "87",
        label: "Compensación previa no aplicada (110 − 78)",
        value: box87,
      },
      {
        code: "69",
        label: "Resultado autoliquidación (46 − 78)",
        value: box69,
      },
    ],
    result: box69,
    carryForward,
  };
}

/**
 * Cadena trimestral del 303: casilla 110 arrastra saldos a compensar.
 * Si hay 303 presentado del trimestre, el arrastre al siguiente usa ese
 * saldo (casilla 87 + resultado negativo), no el borrador.
 */
function buildModelo303Chain(
  year: number,
  invoices: InvoiceRow[],
  expenses: ExpenseRow[],
  marketplace: MarketplaceRow[],
  priorYearCompensation = 0,
  presentedCarryByQuarter: Partial<Record<FiscalQuarter, number>> = {},
  assets: AssetVatRow[] = []
): Record<FiscalQuarter, ModeloBoxes> {
  let pending = round2(Math.max(0, priorYearCompensation));
  const out = {} as Record<FiscalQuarter, ModeloBoxes>;

  for (const q of [1, 2, 3, 4] as FiscalQuarter[]) {
    const { from, to } = quarterRange(year, q);
    const agg = aggregateRows(
      invoices,
      expenses,
      marketplace,
      from,
      to,
      pending,
      assets
    );
    out[q] = agg.modelo303;
    const presentedCarry = presentedCarryByQuarter[q];
    if (presentedCarry != null && Number.isFinite(presentedCarry)) {
      pending = round2(Math.max(0, presentedCarry));
    } else {
      pending = round2(
        Math.max(
          0,
          agg.modelo303.carryForward ?? Math.max(0, -agg.modelo303.result)
        )
      );
    }
  }

  return out;
}

/**
 * Borrador orientativo Modelo 390 (resumen anual IVA).
 * Números de casilla aproximados al régimen general habitual; verificar en AEAT.
 * Declaración informativa: no genera pago (result = suma de 303 del año).
 */
function buildModelo390(
  issued: FiscalPeriodSummary["issued"],
  expenses: FiscalPeriodSummary["expenses"],
  ivaNetYear: number
): ModeloBoxes {
  const bucketAt = (rate: number) =>
    issued.vatBuckets.find((b) => Math.abs(b.rate - rate) < 0.01) ?? {
      rate,
      base: 0,
      quota: 0,
    };
  const b4 = bucketAt(4);
  const b10 = bucketAt(10);
  const b21 = bucketAt(21);
  const otherBase = round2(
    issued.vatBuckets
      .filter((b) => ![4, 10, 21].some((r) => Math.abs(b.rate - r) < 0.01))
      .reduce((s, b) => s + b.base, 0)
  );
  const otherQuota = round2(
    issued.vatBuckets
      .filter((b) => ![4, 10, 21].some((r) => Math.abs(b.rate - r) < 0.01))
      .reduce((s, b) => s + b.quota, 0)
  );

  const volumeOps = round2(
    issued.baseSujeta +
      issued.baseExenta +
      issued.baseIntracom +
      issued.baseExport +
      issued.baseCanarias +
      issued.baseMarketplaceCollected
  );

  return {
    boxes: [
      {
        code: "99",
        label: "Volumen de operaciones (orientativo)",
        value: volumeOps,
      },
      { code: "01", label: "Base imponible 4% (régimen general)", value: b4.base },
      { code: "02", label: "Cuota 4%", value: b4.quota },
      { code: "03", label: "Base imponible 10%", value: b10.base },
      { code: "04", label: "Cuota 10%", value: b10.quota },
      { code: "05", label: "Base imponible 21%", value: b21.base },
      { code: "06", label: "Cuota 21%", value: b21.quota },
      {
        code: "—",
        label: "Otras bases sujetas (tipos distintos)",
        value: otherBase,
      },
      {
        code: "—",
        label: "Otras cuotas repercutidas",
        value: otherQuota,
      },
      {
        code: "21",
        label: "Total bases régimen general (sujetas)",
        value: issued.baseSujeta,
      },
      {
        code: "22",
        label: "Total cuotas IVA devengado",
        value: issued.quotaRepercutida,
      },
      {
        code: "—",
        label: "Operaciones exentas",
        value: issued.baseExenta,
      },
      {
        code: "—",
        label: "Intracomunitarias (base)",
        value: issued.baseIntracom,
      },
      {
        code: "—",
        label: "Exportaciones (base)",
        value: issued.baseExport,
      },
      {
        code: "—",
        label: "Canarias / IGIC (base)",
        value: issued.baseCanarias,
      },
      {
        code: "—",
        label: "Marketplace OSS (IVA recaudado por plataforma)",
        value: issued.baseMarketplaceCollected,
      },
      {
        code: "29",
        label: "IVA deducible (gastos corrientes + AIB)",
        value: round2(expenses.vatDeductible + expenses.aibQuota),
      },
      {
        code: "—",
        label: "Adquisiciones intracomunitarias (base)",
        value: expenses.aibBase,
      },
      {
        code: "48",
        label: "Base gastos deducibles (referencia)",
        value: expenses.base,
      },
      {
        code: "86",
        label: "Resultado liquidación anual (suma 303)",
        value: ivaNetYear,
      },
    ],
    result: ivaNetYear,
  };
}

function buildModelo130(
  incomeBase: number,
  expenseBase: number,
  irpfWithheld: number,
  priorPayments = 0
): ModeloBoxes {
  const rendimiento = round2(incomeBase - expenseBase);
  const pago20 = round2(Math.max(0, rendimiento) * 0.2);
  const prior = round2(Math.max(0, priorPayments));
  const retenciones = round2(Math.max(0, irpfWithheld));
  const resultado130 = round2(pago20 - prior - retenciones);

  return {
    boxes: [
      {
        code: "01",
        label: "Ingresos computables (desde 1 de enero)",
        value: incomeBase,
      },
      {
        code: "02",
        label:
          "Gastos deducibles (corrientes + amortizaciones, desde 1 de enero)",
        value: expenseBase,
      },
      {
        code: "03",
        label: "Rendimiento neto (01 − 02)",
        value: rendimiento,
      },
      {
        code: "04",
        label: "20 % del rendimiento neto positivo",
        value: pago20,
      },
      {
        code: "05",
        label: "Pagos fraccionados anteriores del ejercicio",
        value: prior,
      },
      {
        code: "06",
        label: "Retenciones e ingresos a cuenta (desde 1 de enero)",
        value: retenciones,
      },
      {
        code: "07",
        label: "Resultado (04 − 05 − 06)",
        value: resultado130,
      },
    ],
    result: resultado130,
  };
}

/**
 * Cadena del 130: YTD (1 ene → fin T). Casilla 05 = pagos presentados previos
 * si existen; si no, resultados positivos de borradores previos.
 * Amortizaciones: prorrateo por mes de alta hasta fin de cada T.
 */
async function buildModelo130Chain(
  year: number,
  invoices: InvoiceRow[],
  expenses: ExpenseRow[],
  marketplace: MarketplaceRow[],
  amortizationRows: AmortizationPeriodInput[],
  presentedPriorByQuarter: Partial<Record<FiscalQuarter, number>>
): Promise<Record<FiscalQuarter, ModeloBoxes>> {
  const yearStart = yearRange(year).from;
  let priorPayments = 0;
  const out = {} as Record<FiscalQuarter, ModeloBoxes>;

  for (const q of [1, 2, 3, 4] as FiscalQuarter[]) {
    const { to } = quarterRange(year, q);
    const agg = aggregateRows(invoices, expenses, marketplace, yearStart, to);
    const amortYtd = sumAmortizationYtd(amortizationRows, year, q);
    const draft = buildModelo130(
      agg.issued.incomeBase,
      round2(agg.expenses.base + amortYtd),
      agg.issued.irpfWithheld,
      priorPayments
    );
    out[q] = draft;
    const presentedPrior = presentedPriorByQuarter[q];
    if (presentedPrior != null && Number.isFinite(presentedPrior)) {
      // Tras este T, el siguiente usa el resultado presentado si ya está guardado
      priorPayments = round2(priorPayments + Math.max(0, presentedPrior));
    } else {
      priorPayments = round2(priorPayments + Math.max(0, draft.result));
    }
  }

  return out;
}

function aggregateRows(
  invoices: InvoiceRow[],
  expenses: ExpenseRow[],
  marketplace: MarketplaceRow[],
  from: Date,
  to: Date,
  priorCompensation303 = 0,
  assets: AssetVatRow[] = []
): {
  issued: FiscalPeriodSummary["issued"];
  expenses: FiscalPeriodSummary["expenses"];
  modelo303: ModeloBoxes;
  modelo130: ModeloBoxes;
} {
  const invs = invoices.filter((i) => inRange(i.issueDate, from, to));
  const exps = expenses.filter((e) => inRange(e.issueDate, from, to));
  const mkts = marketplace.filter((m) => inRange(m.issueDate, from, to));
  const assetRows = assets.filter(
    (a) =>
      a.purchaseDate != null &&
      inRange(a.purchaseDate, from, to) &&
      !isExpenseIntracom(a.vatOperationType)
  );

  const vatMap = new Map<number, VatBucket>();
  let baseExenta = 0;
  let baseIntracom = 0;
  let baseExport = 0;
  let baseCanarias = 0;
  let baseMarketplaceCollected = 0;
  let irpfWithheld = 0;
  let invoiceIncomeBase = 0;

  for (const inv of invs) {
    const subtotal = Number(inv.subtotal);
    invoiceIncomeBase = round2(invoiceIncomeBase + subtotal);
    irpfWithheld = round2(irpfWithheld + Number(inv.irpfAmount));

    const op = (inv.vatOperationType || "SUJETA").toUpperCase();
    if (op === "EXENTA") {
      baseExenta = round2(baseExenta + subtotal);
      continue;
    }
    if (op === "INTRACOMUNITARIA") {
      baseIntracom = round2(baseIntracom + subtotal);
      continue;
    }
    if (op === "CANARIAS") {
      baseCanarias = round2(baseCanarias + subtotal);
      continue;
    }
    if (op === "EXPORTACION") {
      baseExport = round2(baseExport + subtotal);
      continue;
    }

    if (inv.lines.length) {
      for (const line of inv.lines) {
        addBucket(
          vatMap,
          line.vatRate,
          Number(line.lineSubtotal),
          Number(line.lineVat)
        );
      }
    } else {
      const rate =
        subtotal > 0
          ? round2((Number(inv.vatAmount) / subtotal) * 100)
          : 21;
      addBucket(vatMap, rate, subtotal, Number(inv.vatAmount));
    }
  }

  let marketplaceIncomeBase = 0;
  for (const m of mkts) {
    const subtotal = Number(m.subtotal);
    const vatAmount = Number(m.vatAmount);
    marketplaceIncomeBase = round2(marketplaceIncomeBase + subtotal);
    const status = (m.vatStatus || "TAXABLE").toUpperCase();
    if (status === "TAXABLE") {
      addBucket(vatMap, m.vatRate || 21, subtotal, vatAmount);
    } else if (status === "MARKETPLACE_COLLECTED") {
      baseMarketplaceCollected = round2(baseMarketplaceCollected + subtotal);
    } else {
      baseExenta = round2(baseExenta + subtotal);
    }
  }

  const incomeBase = round2(invoiceIncomeBase + marketplaceIncomeBase);
  const vatBuckets = [...vatMap.values()].sort((a, b) => b.rate - a.rate);
  const baseSujeta = round2(vatBuckets.reduce((s, b) => s + b.base, 0));
  const quotaRepercutida = round2(
    vatBuckets.reduce((s, b) => s + b.quota, 0)
  );

  let expenseBase = 0;
  let expenseVatInterior = 0;
  let expenseBaseInterior = 0;
  let investmentBase = 0;
  let investmentVat = 0;
  let aibBase = 0;
  let aibQuota = 0;
  let importServiceBase = 0;
  let importServiceQuota = 0;
  let expenseTotal = 0;
  for (const e of exps) {
    const sub = Number(e.subtotal);
    const vat = Number(e.vatAmount);
    const tot = Number(e.total);
    const deductibleOk = e.deductible !== false;
    const rate = e.vatRate > 0 ? e.vatRate : 21;
    const reverseQuota = vat > 0 ? vat : round2(sub * (rate / 100));
    if (deductibleOk) {
      expenseTotal = round2(expenseTotal + tot);
      // IRPF: el bien de inversión no se gasta entero el año de compra;
      // entra por amortización (buildModelo130Chain suma amortYtd).
      if (!e.isInvestment) {
        expenseBase = round2(expenseBase + sub);
      }
    }
    // AIB UE: casillas 10/11 + deducción 36/37. Servicios extracom: 16/17 + deducción 29.
    if (isExpenseIntracom(e.vatOperationType)) {
      aibBase = round2(aibBase + sub);
      aibQuota = round2(aibQuota + reverseQuota);
    } else if (isExpenseImportService(e.vatOperationType)) {
      importServiceBase = round2(importServiceBase + sub);
      importServiceQuota = round2(importServiceQuota + reverseQuota);
      if (deductibleOk && !e.isInvestment) {
        expenseVatInterior = round2(expenseVatInterior + reverseQuota);
      }
    } else if (deductibleOk && !e.isInvestment) {
      expenseBaseInterior = round2(expenseBaseInterior + sub);
      expenseVatInterior = round2(expenseVatInterior + vat);
    }
    // Interior + inversión: casillas 30/31 vía InvestmentAsset (no aquí)
  }

  for (const a of assetRows) {
    investmentBase = round2(investmentBase + Number(a.base));
    investmentVat = round2(investmentVat + Number(a.vatAmount));
  }

  return {
    issued: {
      count: invs.length,
      vatBuckets,
      baseSujeta,
      quotaRepercutida,
      baseExenta,
      baseIntracom,
      baseExport,
      baseCanarias,
      baseMarketplaceCollected,
      irpfWithheld,
      incomeBase,
      invoiceIncomeBase,
      marketplaceCount: mkts.length,
      marketplaceIncomeBase,
    },
    expenses: {
      count: exps.length,
      base: expenseBase,
      vatDeductible: round2(expenseVatInterior + investmentVat),
      aibBase,
      aibQuota,
      importServiceBase,
      importServiceQuota,
      total: expenseTotal,
    },
    modelo303: buildModelo303({
      vatBuckets,
      expenseBase: expenseBaseInterior,
      expenseVat: expenseVatInterior,
      investmentBase,
      investmentVat,
      aibBase,
      aibQuota,
      importServiceBase,
      importServiceQuota,
      baseExenta,
      baseIntracom,
      baseExport,
      baseCanarias,
      baseMarketplaceCollected,
      priorCompensation: priorCompensation303,
    }),
    // Placeholder: el 130 trimestral real se calcula en buildFiscalPeriodSummary / year (YTD + cadena).
    modelo130: buildModelo130(incomeBase, expenseBase, irpfWithheld, 0),
  };
}

const invoiceSelect = {
  issueDate: true,
  subtotal: true,
  vatAmount: true,
  irpfAmount: true,
  vatOperationType: true,
  lines: {
    select: {
      vatRate: true,
      lineSubtotal: true,
      lineVat: true,
    },
  },
} as const;

async function fetchFiscalRows(from: Date, to: Date) {
  const [invoices, expenses, marketplace, assets] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        status: { not: "ANULADA" },
        issueDate: { gte: from, lte: to },
      },
      select: invoiceSelect,
    }),
    prisma.expense.findMany({
      where: {
        issueDate: { gte: from, lte: to },
      },
      select: {
        issueDate: true,
        subtotal: true,
        vatAmount: true,
        vatRate: true,
        total: true,
        vatOperationType: true,
        deductible: true,
        isInvestment: true,
      },
    }),
    prisma.marketplaceIncome.findMany({
      where: {
        issueDate: { gte: from, lte: to },
      },
      select: {
        issueDate: true,
        subtotal: true,
        vatAmount: true,
        vatRate: true,
        vatStatus: true,
      },
    }),
    prisma.investmentAsset.findMany({
      where: {
        purchaseDate: { gte: from, lte: to },
      },
      select: {
        purchaseDate: true,
        base: true,
        vatAmount: true,
        vatOperationType: true,
      },
    }),
  ]);
  return {
    invoices: invoices as InvoiceRow[],
    expenses: expenses as ExpenseRow[],
    marketplace: marketplace as MarketplaceRow[],
    assets: assets as AssetVatRow[],
  };
}

async function fetchYearAmortizationRows(
  year: number
): Promise<AmortizationPeriodInput[]> {
  const rows = await prisma.investmentAmortization.findMany({
    where: { year },
    select: {
      amount: true,
      asset: {
        select: {
          purchaseDate: true,
          startYear: true,
          usefulLifeYears: true,
        },
      },
    },
  });
  return rows.map((r) => ({
    yearAmount: Number(r.amount),
    purchaseDate: r.asset.purchaseDate,
    startYear: r.asset.startYear,
    usefulLifeYears: r.asset.usefulLifeYears,
  }));
}

async function fetchPresented130Results(
  year: number
): Promise<Partial<Record<FiscalQuarter, number>>> {
  const rows = await prisma.fiscalFiling.findMany({
    where: { modelType: "130", year, quarter: { not: null } },
    select: { quarter: true, result: true },
  });
  const out: Partial<Record<FiscalQuarter, number>> = {};
  for (const r of rows) {
    if (r.quarter === 1 || r.quarter === 2 || r.quarter === 3 || r.quarter === 4) {
      out[r.quarter as FiscalQuarter] = Number(r.result);
    }
  }
  return out;
}

/** Carry-forward (casilla 87 + resultado a compensar) de 303 presentados del año. */
async function fetchPresented303Carries(
  year: number
): Promise<Partial<Record<FiscalQuarter, number>>> {
  const rows = await prisma.fiscalFiling.findMany({
    where: { modelType: "303", year, quarter: { not: null } },
    select: { quarter: true, result: true, boxes: true },
  });
  const out: Partial<Record<FiscalQuarter, number>> = {};
  for (const r of rows) {
    if (r.quarter === 1 || r.quarter === 2 || r.quarter === 3 || r.quarter === 4) {
      out[r.quarter as FiscalQuarter] = carryFromPresented303(r);
    }
  }
  return out;
}

/** Agrega facturas emitidas + gastos del trimestre para libros y borradores 303/130. */
export async function buildFiscalPeriodSummary(
  year: number,
  quarter: FiscalQuarter
): Promise<FiscalPeriodSummary> {
  const { from, to } = quarterRange(year, quarter);
  const label = `${quarter}T ${year}`;
  // 303 = solo el trimestre; 130 = YTD desde 1 ene (necesita filas de todo el año hasta fin T)
  const yearStart = yearRange(year).from;
  const [
    { invoices, expenses, marketplace, assets },
    priorYearCompensation,
    amortRows,
    presented130,
    presented303,
  ] = await Promise.all([
    fetchFiscalRows(yearStart, to),
    getPriorYear303Compensation(year),
    fetchYearAmortizationRows(year),
    fetchPresented130Results(year),
    fetchPresented303Carries(year),
  ]);
  const quarterAgg = aggregateRows(
    invoices,
    expenses,
    marketplace,
    from,
    to,
    0,
    assets
  );
  const chain130 = await buildModelo130Chain(
    year,
    invoices,
    expenses,
    marketplace,
    amortRows,
    presented130
  );
  const chain303 = buildModelo303Chain(
    year,
    invoices,
    expenses,
    marketplace,
    priorYearCompensation,
    presented303,
    assets
  );

  const modelo130 = chain130[quarter];

  return {
    year,
    quarter,
    from,
    to,
    label,
    issued: quarterAgg.issued,
    expenses: quarterAgg.expenses,
    modelo303: chain303[quarter],
    modelo130,
  };
}

/**
 * Resumen fiscal del año completo: 3 queries + agregación en memoria
 * (anual + desglose por trimestre).
 */
export async function buildFiscalYearSummary(
  year: number
): Promise<FiscalYearSummary> {
  const { from, to } = yearRange(year);
  const [
    { invoices, expenses, marketplace, assets },
    priorYearCompensation,
    amortRows,
    presented130,
    presented303,
  ] = await Promise.all([
    fetchFiscalRows(from, to),
    getPriorYear303Compensation(year),
    fetchYearAmortizationRows(year),
    fetchPresented130Results(year),
    fetchPresented303Carries(year),
  ]);
  const yearAgg = aggregateRows(
    invoices,
    expenses,
    marketplace,
    from,
    to,
    0,
    assets
  );
  const chain130 = await buildModelo130Chain(
    year,
    invoices,
    expenses,
    marketplace,
    amortRows,
    presented130
  );
  const chain303 = buildModelo303Chain(
    year,
    invoices,
    expenses,
    marketplace,
    priorYearCompensation,
    presented303,
    assets
  );

  const quarters: FiscalQuarterSlice[] = ([1, 2, 3, 4] as FiscalQuarter[]).map(
    (q) => {
      const range = quarterRange(year, q);
      const agg = aggregateRows(
        invoices,
        expenses,
        marketplace,
        range.from,
        range.to,
        0,
        assets
      );
      const amortYtd = sumAmortizationYtd(amortRows, year, q);
      return {
        quarter: q,
        label: `${q}T ${year}`,
        incomeBase: agg.issued.incomeBase,
        expensesBase: round2(agg.expenses.base + amortYtd),
        irpfWithheld: agg.issued.irpfWithheld,
        modelo303Result: chain303[q].result,
        modelo130Result: chain130[q].result,
      };
    }
  );

  const ivaNetYear = round2(
    quarters.reduce((s, q) => s + q.modelo303Result, 0)
  );
  // Suma de lo a ingresar por trimestre (solo positivos, coherente con casilla 05)
  const irpfPaymentsYear = round2(
    ([1, 2, 3, 4] as FiscalQuarter[]).reduce(
      (s, q) => s + Math.max(0, chain130[q].result),
      0
    )
  );

  return {
    year,
    from,
    to,
    label: `Año ${year}`,
    issued: yearAgg.issued,
    expenses: yearAgg.expenses,
    // Agregado anual sin cadena de compensación (eso es por trimestre)
    modelo303: yearAgg.modelo303,
    modelo130: chain130[4],
    modelo390: buildModelo390(yearAgg.issued, yearAgg.expenses, ivaNetYear),
    ivaNetYear,
    irpfPaymentsYear,
    quarters,
  };
}

/**
 * Semilla de casilla 110 al empezar el año: arrastre del 4T anterior
 * (casilla 87 + resultado a compensar del presentado, o cadena borrador).
 */
async function getPriorYear303Compensation(year: number): Promise<number> {
  const prev = year - 1;
  const presented = await prisma.fiscalFiling.findUnique({
    where: {
      periodKey: fiscalFilingPeriodKey("303", prev, 4),
    },
    select: { result: true, boxes: true },
  });
  if (presented) {
    return carryFromPresented303(presented);
  }
  // Sin 4T presentado: calcula cadena 303 del año anterior (sin recursión de compensación)
  const { to } = yearRange(prev);
  const yearStart = yearRange(prev).from;
  const { invoices, expenses, marketplace, assets } = await fetchFiscalRows(
    yearStart,
    to
  );
  const chain = buildModelo303Chain(
    prev,
    invoices,
    expenses,
    marketplace,
    0,
    {},
    assets
  );
  const last = chain[4];
  return round2(
    last.carryForward ?? Math.max(0, last.result < 0 ? -last.result : 0)
  );
}
