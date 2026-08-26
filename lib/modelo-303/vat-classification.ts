/**
 * Clasificación fiscal IVA — fuente de verdad para Modelo 303.
 * No usar heurísticas geográficas sueltas fuera de este módulo.
 */

/** Operaciones de venta (facturas emitidas). */
export type SalesVatKind =
  | "DOMESTIC_TAXABLE"
  | "EXEMPT"
  | "EU_DELIVERY"
  | "EU_SERVICE"
  | "EXPORT"
  | "CANARY_ISLANDS";

/**
 * Operaciones de compra (gastos).
 * Distingue inequívocamente bienes UE, servicios UE, servicios no UE e importación.
 */
export type PurchaseVatKind =
  | "DOMESTIC"
  | "EU_GOODS"
  | "EU_SERVICES"
  | "NON_EU_SERVICES"
  | "REVERSE_CHARGE_DOMESTIC"
  | "IMPORT_GOODS";

export const PURCHASE_VAT_KIND_LABELS: Record<PurchaseVatKind, string> = {
  DOMESTIC: "Operación interior",
  EU_GOODS: "Adquisición intracomunitaria de bienes (AIB)",
  EU_SERVICES: "Servicio intracomunitario (inversión del sujeto pasivo)",
  NON_EU_SERVICES: "Servicio de proveedor no UE (inversión del sujeto pasivo)",
  REVERSE_CHARGE_DOMESTIC:
    "Inversión del sujeto pasivo interior (otras operaciones ISP)",
  IMPORT_GOODS: "Importación de bienes (requiere documentación aduanera)",
};

export function parseSalesVatKind(raw: unknown): SalesVatKind {
  const v = String(raw ?? "SUJETA").toUpperCase().trim();
  if (v === "EXENTA") return "EXEMPT";
  if (
    v === "SERVICIO_INTRACOMUNITARIO" ||
    v === "EU_SERVICES" ||
    v === "EU_SERVICE" ||
    v === "SERVICIO_UE"
  ) {
    return "EU_SERVICE";
  }
  if (v === "INTRACOMUNITARIA" || v === "INTRACOM") return "EU_DELIVERY";
  if (v === "EXPORTACION" || v === "EXPORT") return "EXPORT";
  if (v === "CANARIAS" || v === "CEUTA" || v === "MELILLA") return "CANARY_ISLANDS";
  return "DOMESTIC_TAXABLE";
}

export function parsePurchaseVatKind(raw: unknown): PurchaseVatKind {
  const v = String(raw ?? "INTERIOR").toUpperCase().trim();
  if (
    v === "IMPORTACION_BIENES" ||
    v === "IMPORT_GOODS" ||
    v === "IMPORTACION" ||
    v === "DUA" ||
    v === "IMPORT"
  ) {
    return "IMPORT_GOODS";
  }
  if (
    v === "SERVICIO_INTRACOMUNITARIO" ||
    v === "EU_SERVICES" ||
    v === "UE_SERVICIO" ||
    v === "SERVICIO_UE" ||
    v === "EU_SERVICE"
  ) {
    return "EU_SERVICES";
  }
  if (
    v === "REVERSE_CHARGE_DOMESTIC" ||
    v === "ISP_NACIONAL" ||
    v === "ISP_INTERIOR"
  ) {
    return "REVERSE_CHARGE_DOMESTIC";
  }
  if (
    v === "SERVICIO_EXTRACOMUNITARIO" ||
    v === "IMPORTACION_SERVICIOS" ||
    v === "EXTRACOMUNITARIA" ||
    v === "TERCER_PAIS" ||
    v === "EEUU" ||
    v === "USA" ||
    v === "IMPORT_SERVICE" ||
    v === "NON_EU_SERVICES" ||
    v === "ISP"
  ) {
    return "NON_EU_SERVICES";
  }
  if (v === "INTRACOMUNITARIA" || v === "INTRACOM" || v === "AIB" || v === "EU_GOODS") {
    return "EU_GOODS";
  }
  return "DOMESTIC";
}

export function isPurchaseReverseCharge(kind: PurchaseVatKind): boolean {
  return (
    kind === "EU_GOODS" ||
    kind === "EU_SERVICES" ||
    kind === "NON_EU_SERVICES" ||
    kind === "REVERSE_CHARGE_DOMESTIC"
  );
}

/** Operaciones ISP que van a casillas 12/13 (no intracomunitarias). */
export function isOtherIspPurchase(kind: PurchaseVatKind): boolean {
  return kind === "NON_EU_SERVICES" || kind === "REVERSE_CHARGE_DOMESTIC";
}

/** Operaciones intracomunitarias (adquisiciones UE) → casillas 10/11. */
export function isEuIntracomPurchase(kind: PurchaseVatKind): boolean {
  return kind === "EU_GOODS" || kind === "EU_SERVICES";
}

/** Compatibilidad con helpers legacy en fiscal.ts */
export function purchaseKindToLegacyExpenseType(kind: PurchaseVatKind): string {
  switch (kind) {
    case "EU_GOODS":
      return "INTRACOMUNITARIA";
    case "EU_SERVICES":
      return "SERVICIO_INTRACOMUNITARIO";
    case "NON_EU_SERVICES":
      return "SERVICIO_EXTRACOMUNITARIO";
    case "REVERSE_CHARGE_DOMESTIC":
      return "ISP_NACIONAL";
    case "IMPORT_GOODS":
      return "IMPORTACION_BIENES";
    default:
      return "INTERIOR";
  }
}
