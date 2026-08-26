import {
  parsePurchaseVatKind,
  parseSalesVatKind,
  type PurchaseVatKind,
  type SalesVatKind,
} from "@/lib/modelo-303/vat-classification";
import type { Model349OperationKey } from "@/lib/modelo-349/types";

/** Claves activas en el scope actual de VEXO. */
export const MODEL349_ACTIVE_KEYS = ["E", "A", "S", "I"] as const;

/** Claves reservadas para futuras operaciones (no emitidas por el motor). */
export const MODEL349_RESERVED_KEYS = ["T", "M", "H", "R", "D", "C"] as const;

export const MODEL349_KEY_LABELS: Record<Model349OperationKey, string> = {
  E: "Entregas intracomunitarias de bienes",
  A: "Adquisiciones intracomunitarias de bienes",
  S: "Prestaciones intracomunitarias de servicios",
  I: "Adquisiciones intracomunitarias de servicios",
  T: "Operaciones triangulares (no implementado)",
  M: "Operaciones en mercados organizados (no implementado)",
  H: "Operaciones en depósitos fiscales (no implementado)",
  R: "Operaciones en régimen especial (no implementado)",
  D: "Devoluciones (no implementado)",
  C: "Operaciones con Canarias/Ceuta/Melilla (no implementado)",
};

export function resolve349KeyFromSale(
  vatOperationType: string | null | undefined
): Model349OperationKey | null {
  const kind = parseSalesVatKind(vatOperationType);
  return salesKindTo349Key(kind);
}

export function resolve349KeyFromPurchase(
  vatOperationType: string | null | undefined
): Model349OperationKey | null {
  const kind = parsePurchaseVatKind(vatOperationType);
  return purchaseKindTo349Key(kind);
}

export function salesKindTo349Key(kind: SalesVatKind): Model349OperationKey | null {
  if (kind === "EU_DELIVERY") return "E";
  if (kind === "EU_SERVICE") return "S";
  return null;
}

export function purchaseKindTo349Key(
  kind: PurchaseVatKind
): Model349OperationKey | null {
  if (kind === "EU_GOODS") return "A";
  if (kind === "EU_SERVICES") return "I";
  return null;
}

export function is349ExcludedSaleKind(kind: SalesVatKind): boolean {
  return (
    kind === "DOMESTIC_TAXABLE" ||
    kind === "EXEMPT" ||
    kind === "EXPORT" ||
    kind === "CANARY_ISLANDS"
  );
}

export function is349ExcludedPurchaseKind(kind: PurchaseVatKind): boolean {
  return (
    kind === "DOMESTIC" ||
    kind === "NON_EU_SERVICES" ||
    kind === "REVERSE_CHARGE_DOMESTIC" ||
    kind === "IMPORT_GOODS"
  );
}
