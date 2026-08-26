import type { FiscalQuarter } from "@/lib/fiscal";
import {
  buildModel347Result,
  MODEL_347_THRESHOLD,
  type Model347Operator,
  type Model347Result,
} from "@/lib/modelo-347";
import {
  buildModel349Result,
  type Model349Operation,
  type Model349Result,
} from "@/lib/modelo-349";

/** Re-export oficial — no repetir en otros módulos. */
export { MODEL_347_THRESHOLD, MODELO_347_THRESHOLD } from "@/lib/modelo-347/threshold";

export type ThirdPartyOp = {
  nif: string;
  name: string;
  countryCode: string | null;
  /** 347: A compras / B ventas. 349: E/A/S/I. */
  key: string;
  amount: number;
  count: number;
};

/** Legacy + motor auditable Fase 6. */
export type Modelo347Draft = Model347Result & {
  threshold: number;
  declared: ThirdPartyOp[];
  belowThreshold: ThirdPartyOp[];
  totalDeclared: number;
  skippedNoNif: { sales: number; purchases: number };
};

/** Borrador 349 auditable (Fase 5) + campos legacy para hub/guía. */
export type Modelo349Draft = Model349Result & {
  entregas: ThirdPartyOp[];
  adquisiciones: ThirdPartyOp[];
  totalEntregas: number;
  totalAdquisiciones: number;
  skippedNoNif: { entregas: number; adquisiciones: number };
};

export function normalizeTaxId(raw: string | null | undefined): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[\s.\-]/g, "")
    .trim();
}

/** NIF temporales de import (no declarar en 347/349). Acepta valor crudo o normalizado. */
export function isPlaceholderTaxId(nif: string): boolean {
  return String(nif ?? "")
    .toUpperCase()
    .replace(/[\s.\-]/g, "")
    .startsWith("PEND");
}

/** Prefijo país ISO desde NIF-IVA UE (ESB123… → ES). */
export function countryFromVatId(nif: string): string | null {
  const m = /^([A-Z]{2})/.exec(nif);
  if (!m) return null;
  const cc = m[1];
  if (cc === "EL") return "GR";
  return cc;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toThirdPartyOp347(op: Model347Operator): ThirdPartyOp {
  return {
    nif: op.taxId,
    name: op.name,
    countryCode: op.country,
    key: op.operationType,
    amount: op.annualAmount,
    count: op.trace.length,
  };
}

function map347Legacy(result: Model347Result): Pick<
  Modelo347Draft,
  "declared" | "belowThreshold" | "totalDeclared" | "threshold" | "skippedNoNif"
> {
  const declared = result.declarableOperators.map(toThirdPartyOp347);
  const belowThreshold = result.operators
    .filter((o) => !o.declarable)
    .map(toThirdPartyOp347);
  const skippedSales = result.warnings.filter(
    (w) => w.code.startsWith("OPERATOR_347") && w.sourceId
  ).length;
  return {
    threshold: MODEL_347_THRESHOLD,
    declared,
    belowThreshold,
    totalDeclared: round2(result.salesTotal + result.purchasesTotal),
    skippedNoNif: {
      sales: skippedSales,
      purchases: result.skippedOperatorReview,
    },
  };
}

function sortOps(ops: ThirdPartyOp[]): ThirdPartyOp[] {
  return [...ops].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

function toThirdPartyOp349(op: Model349Operation): ThirdPartyOp {
  return {
    nif: op.vatId,
    name: op.operatorName,
    countryCode: op.country,
    key: op.key,
    amount: op.amount,
    count: op.trace.length,
  };
}

function map349Legacy(result: Model349Result): Pick<
  Modelo349Draft,
  | "entregas"
  | "adquisiciones"
  | "totalEntregas"
  | "totalAdquisiciones"
  | "skippedNoNif"
> {
  const entregas = sortOps(
    result.operations
      .filter((o) => o.key === "E" || o.key === "S")
      .map(toThirdPartyOp349)
  );
  const adquisiciones = sortOps(
    result.operations
      .filter((o) => o.key === "A" || o.key === "I")
      .map(toThirdPartyOp349)
  );
  return {
    entregas,
    adquisiciones,
    totalEntregas: round2(entregas.reduce((s, o) => s + o.amount, 0)),
    totalAdquisiciones: round2(adquisiciones.reduce((s, o) => s + o.amount, 0)),
    skippedNoNif: {
      entregas: result.skippedMissingVatIdEntregas,
      adquisiciones: result.skippedMissingVatIdAdquisiciones,
    },
  };
}

/**
 * Borrador 347 auditable: elegibilidad, umbral por operador, desglose trimestral.
 */
export async function buildModelo347Draft(year: number): Promise<Modelo347Draft> {
  const result = await buildModel347Result(year);
  const legacy = map347Legacy(result);
  return { ...result, ...legacy };
}

/**
 * Borrador 349 auditable: claves E/A/S/I, agrupación por operador, trazabilidad.
 */
export async function buildModelo349Draft(
  year: number,
  quarter: FiscalQuarter
): Promise<Modelo349Draft> {
  const result = await buildModel349Result(year, quarter);
  const legacy = map349Legacy(result);
  return { ...result, ...legacy };
}
