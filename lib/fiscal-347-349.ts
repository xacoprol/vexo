import { quarterRange, yearRange, type FiscalQuarter } from "@/lib/fiscal";
import { FISCAL_STATUS } from "@/lib/invoice-fiscal-lifecycle";
import { prisma } from "@/lib/prisma";

/** Umbral legal modelo 347 (operaciones anuales con el mismo tercero). */
export const MODELO_347_THRESHOLD = 3005.06;

export type ThirdPartyOp = {
  nif: string;
  name: string;
  countryCode: string | null;
  /** 347: A compras / B ventas. 349: E entregas / A adquisiciones. */
  key: string;
  amount: number;
  count: number;
};

export type Modelo347Draft = {
  year: number;
  threshold: number;
  declared: ThirdPartyOp[];
  belowThreshold: ThirdPartyOp[];
  totalDeclared: number;
  salesTotal: number;
  purchasesTotal: number;
  skippedNoNif: { sales: number; purchases: number };
};

export type Modelo349Draft = {
  year: number;
  quarter: FiscalQuarter;
  label: string;
  entregas: ThirdPartyOp[];
  adquisiciones: ThirdPartyOp[];
  totalEntregas: number;
  totalAdquisiciones: number;
  /** Operadores con NIF listos para declarar */
  hasOps: boolean;
  /** Hay ops UE sin NIF-IVA (el 303 puede llevarlas; el 349 no) */
  incompleteNif: boolean;
  /** hasOps o incompleteNif → no digas «no aplica» */
  needsAttention: boolean;
  skippedNoNif: { entregas: number; adquisiciones: number };
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeTaxId(raw: string | null | undefined): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[\s.\-]/g, "")
    .trim();
}

/** NIF temporales de import (no declarar en 347/349). */
export function isPlaceholderTaxId(nif: string): boolean {
  return nif.toUpperCase().startsWith("PEND-");
}

/** Prefijo país ISO desde NIF-IVA UE (ESB123… → ES). */
export function countryFromVatId(nif: string): string | null {
  const m = /^([A-Z]{2})/.exec(nif);
  if (!m) return null;
  const cc = m[1];
  if (cc === "EL") return "GR";
  return cc;
}

function mergeOp(
  map: Map<string, ThirdPartyOp>,
  op: Omit<ThirdPartyOp, "count" | "amount"> & { amount: number }
) {
  const k = `${op.key}|${op.nif}`;
  const cur = map.get(k);
  if (cur) {
    cur.amount = round2(cur.amount + op.amount);
    cur.count += 1;
    if (!cur.name && op.name) cur.name = op.name;
    if (!cur.countryCode && op.countryCode) cur.countryCode = op.countryCode;
  } else {
    map.set(k, { ...op, count: 1, amount: round2(op.amount) });
  }
}

function sortOps(ops: ThirdPartyOp[]): ThirdPartyOp[] {
  return [...ops].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

/**
 * Borrador 347: terceros ES (ventas nacionales + compras interiores)
 * con importe anual ≥ 3.005,06 € (IVA incluido, criterio AEAT habitual).
 */
export async function buildModelo347Draft(year: number): Promise<Modelo347Draft> {
  const { from, to } = yearRange(year);
  const [invoices, expenses] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        status: { not: "ANULADA" },
        fiscalStatus: FISCAL_STATUS.ISSUED,
        issueDate: { gte: from, lte: to },
        vatOperationType: { in: ["SUJETA", "EXENTA"] },
      },
      select: {
        total: true,
        operationKey347: true,
        client: { select: { name: true, nif: true, countryCode: true } },
      },
    }),
    prisma.expense.findMany({
      where: {
        issueDate: { gte: from, lte: to },
        vatOperationType: "INTERIOR",
      },
      select: {
        total: true,
        supplierName: true,
        supplierNif: true,
      },
    }),
  ]);

  const map = new Map<string, ThirdPartyOp>();
  let skippedSales = 0;
  let skippedPurchases = 0;

  for (const inv of invoices) {
    const nif = normalizeTaxId(inv.client.nif);
    if (!nif || isPlaceholderTaxId(nif)) {
      skippedSales += 1;
      continue;
    }
    const cc = (inv.client.countryCode || "ES").toUpperCase();
    // 347 = operaciones con residentes; excluye NIF-IVA UE típicos
    if (cc !== "ES" && countryFromVatId(nif) && countryFromVatId(nif) !== "ES") {
      continue;
    }
    const key = (inv.operationKey347?.trim().toUpperCase() || "B").slice(0, 1);
    mergeOp(map, {
      nif,
      name: inv.client.name,
      countryCode: "ES",
      key: key === "A" ? "A" : "B",
      amount: num(inv.total),
    });
  }

  for (const e of expenses) {
    const nif = normalizeTaxId(e.supplierNif);
    if (!nif || isPlaceholderTaxId(nif)) {
      skippedPurchases += 1;
      continue;
    }
    // 347 = residentes ES; NIF-IVA UE (IE…, DE…, LU…) no se declaran aquí
    const vatCc = countryFromVatId(nif);
    if (vatCc && vatCc !== "ES") continue;
    mergeOp(map, {
      nif,
      name: e.supplierName,
      countryCode: "ES",
      key: "A",
      amount: num(e.total),
    });
  }

  const all = sortOps([...map.values()]);
  const declared = all.filter((o) => Math.abs(o.amount) >= MODELO_347_THRESHOLD);
  const belowThreshold = all.filter(
    (o) => Math.abs(o.amount) < MODELO_347_THRESHOLD
  );

  const salesTotal = round2(
    declared.filter((o) => o.key === "B").reduce((s, o) => s + o.amount, 0)
  );
  const purchasesTotal = round2(
    declared.filter((o) => o.key === "A").reduce((s, o) => s + o.amount, 0)
  );

  return {
    year,
    threshold: MODELO_347_THRESHOLD,
    declared,
    belowThreshold,
    totalDeclared: round2(salesTotal + purchasesTotal),
    salesTotal,
    purchasesTotal,
    skippedNoNif: { sales: skippedSales, purchases: skippedPurchases },
  };
}

/**
 * Borrador 349: entregas (facturas INTRACOMUNITARIA) + adquisiciones (gastos AIB).
 */
export async function buildModelo349Draft(
  year: number,
  quarter: FiscalQuarter
): Promise<Modelo349Draft> {
  const { from, to } = quarterRange(year, quarter);
  const [invoices, expenses] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        status: { not: "ANULADA" },
        fiscalStatus: FISCAL_STATUS.ISSUED,
        issueDate: { gte: from, lte: to },
        vatOperationType: "INTRACOMUNITARIA",
      },
      select: {
        subtotal: true,
        client: { select: { name: true, nif: true, countryCode: true } },
      },
    }),
    prisma.expense.findMany({
      where: {
        issueDate: { gte: from, lte: to },
        vatOperationType: "INTRACOMUNITARIA",
      },
      select: {
        subtotal: true,
        supplierName: true,
        supplierNif: true,
      },
    }),
  ]);

  const entregasMap = new Map<string, ThirdPartyOp>();
  const adquisMap = new Map<string, ThirdPartyOp>();
  let skippedEntregas = 0;
  let skippedAdquis = 0;

  for (const inv of invoices) {
    const nif = normalizeTaxId(inv.client.nif);
    if (!nif || isPlaceholderTaxId(nif)) {
      skippedEntregas += 1;
      continue;
    }
    const cc =
      (inv.client.countryCode || countryFromVatId(nif) || "").toUpperCase() ||
      null;
    mergeOp(entregasMap, {
      nif,
      name: inv.client.name,
      countryCode: cc,
      key: "E",
      amount: num(inv.subtotal),
    });
  }

  for (const e of expenses) {
    const nif = normalizeTaxId(e.supplierNif);
    if (!nif || isPlaceholderTaxId(nif)) {
      skippedAdquis += 1;
      continue;
    }
    mergeOp(adquisMap, {
      nif,
      name: e.supplierName,
      countryCode: countryFromVatId(nif),
      key: "A",
      amount: num(e.subtotal),
    });
  }

  const entregas = sortOps([...entregasMap.values()]);
  const adquisiciones = sortOps([...adquisMap.values()]);
  const totalEntregas = round2(entregas.reduce((s, o) => s + o.amount, 0));
  const totalAdquisiciones = round2(
    adquisiciones.reduce((s, o) => s + o.amount, 0)
  );
  const hasOps = entregas.length + adquisiciones.length > 0;
  const incompleteNif = skippedEntregas + skippedAdquis > 0;

  return {
    year,
    quarter,
    label: `${quarter}T ${year}`,
    entregas,
    adquisiciones,
    totalEntregas,
    totalAdquisiciones,
    hasOps,
    incompleteNif,
    needsAttention: hasOps || incompleteNif,
    skippedNoNif: {
      entregas: skippedEntregas,
      adquisiciones: skippedAdquis,
    },
  };
}
