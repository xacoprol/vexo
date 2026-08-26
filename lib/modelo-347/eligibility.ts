import {
  parsePurchaseVatKind,
  parseSalesVatKind,
  type PurchaseVatKind,
  type SalesVatKind,
} from "@/lib/modelo-303/vat-classification";
import { isSpanish347Counterparty } from "@/lib/modelo-347/operator";
import type { Model347Eligibility, Model347EligibilityReason } from "@/lib/modelo-347/types";

export const ELIGIBILITY_REASON_LABELS: Record<Model347EligibilityReason, string> = {
  INCLUDED_DOMESTIC_SALE: "Venta interior declarable",
  INCLUDED_DOMESTIC_PURCHASE: "Compra interior declarable",
  INCLUDED_RECTIFICATION: "Rectificativa incluida",
  EXCLUDED_MODEL349: "Incluida en Modelo 349 (intracomunitaria)",
  EXCLUDED_EXPORT: "Exportación — fuera del 347",
  EXCLUDED_CANARY_ISLANDS: "Canarias/Ceuta/Melilla — fuera del 347",
  EXCLUDED_IMPORT: "Importación — fuera del 347",
  EXCLUDED_NON_EU_COUNTERPARTY: "Contraparte no residente (347 = residentes)",
  EXCLUDED_ANULLED: "Factura anulada",
  EXCLUDED_NOT_ISSUED: "No emitida fiscalmente",
  EXCLUDED_OPERATOR_UNKNOWN: "Operador no identificable",
  EXCLUDED_MARKETPLACE_NO_OPERATOR: "Marketplace sin contraparte identificable",
};

export function assess347SaleEligibility(opts: {
  vatOperationType: string | null;
  status: string;
  fiscalStatus: string;
  clientTaxId: string;
  clientCountryCode?: string | null;
  invoiceFiscalType?: string | null;
}): Model347Eligibility {
  if (opts.status === "ANULADA") {
    return { include: false, reason: "EXCLUDED_ANULLED" };
  }
  if (opts.fiscalStatus !== "ISSUED") {
    return { include: false, reason: "EXCLUDED_NOT_ISSUED" };
  }

  const kind = parseSalesVatKind(opts.vatOperationType);

  if (kind === "EU_DELIVERY" || kind === "EU_SERVICE") {
    return {
      include: false,
      reason: "EXCLUDED_MODEL349",
      warning: "Operación intracomunitaria — declarar en Modelo 349, no en 347.",
    };
  }
  if (kind === "EXPORT") {
    return { include: false, reason: "EXCLUDED_EXPORT" };
  }
  if (kind === "CANARY_ISLANDS") {
    return { include: false, reason: "EXCLUDED_CANARY_ISLANDS" };
  }

  if (!isSpanish347Counterparty(opts.clientTaxId, opts.clientCountryCode)) {
    return {
      include: false,
      reason: "EXCLUDED_NON_EU_COUNTERPARTY",
      warning: "Cliente con NIF-IVA UE/extranjero — no entra en 347 de residentes.",
    };
  }

  if (opts.invoiceFiscalType === "RECTIFYING") {
    return { include: true, reason: "INCLUDED_RECTIFICATION" };
  }

  return { include: true, reason: "INCLUDED_DOMESTIC_SALE" };
}

export function assess347PurchaseEligibility(opts: {
  vatOperationType: string | null;
  supplierTaxId: string;
  supplierName?: string | null;
}): Model347Eligibility {
  const kind = parsePurchaseVatKind(opts.vatOperationType);

  if (kind === "EU_GOODS" || kind === "EU_SERVICES") {
    return {
      include: false,
      reason: "EXCLUDED_MODEL349",
      warning: "Adquisición intracomunitaria — declarar en Modelo 349, no en 347.",
    };
  }
  if (kind === "IMPORT_GOODS") {
    return { include: false, reason: "EXCLUDED_IMPORT" };
  }

  if (!isSpanish347Counterparty(opts.supplierTaxId)) {
    return {
      include: false,
      reason: "EXCLUDED_NON_EU_COUNTERPARTY",
      warning: "Proveedor con NIF-IVA UE/extranjero — no entra en 347 de residentes.",
    };
  }

  if (kind === "DOMESTIC" || kind === "REVERSE_CHARGE_DOMESTIC" || kind === "NON_EU_SERVICES") {
    return { include: true, reason: "INCLUDED_DOMESTIC_PURCHASE" };
  }

  return { include: true, reason: "INCLUDED_DOMESTIC_PURCHASE" };
}

export function salesKindForAudit(kind: SalesVatKind): string {
  return kind;
}

export function purchaseKindForAudit(kind: PurchaseVatKind): string {
  return kind;
}

export function eligibilityReasonLabel(reason: Model347EligibilityReason): string {
  return ELIGIBILITY_REASON_LABELS[reason] ?? reason;
}
