import {
  countryFromVatId,
  isPlaceholderTaxId,
  normalizeTaxId,
} from "@/lib/fiscal-347-349";

export type Operator347Resolution =
  | {
      valid: true;
      operatorId: string;
      taxId: string;
      name: string;
      country: string | null;
    }
  | {
      valid: false;
      code: "OPERATOR_347_ID_MISSING" | "OPERATOR_347_ID_PLACEHOLDER" | "OPERATOR_347_ID_VARIOS";
      taxId: string;
      name: string;
      country: string | null;
    };

const VARIOS_PATTERN = /\bvarios\b/i;

/**
 * Identificación del operador/contraparte para Modelo 347.
 * No agrupa silenciosamente NIF vacío, PEND-… ni «varios».
 */
export function resolve347Operator(opts: {
  taxIdRaw: string | null | undefined;
  name: string | null | undefined;
  countryCode?: string | null;
  entityId?: string;
}): Operator347Resolution {
  const rawTaxId = String(opts.taxIdRaw ?? "").trim();
  const taxId = normalizeTaxId(rawTaxId);
  const name = String(opts.name ?? "").trim() || "—";
  const country =
    (opts.countryCode ?? "").trim().toUpperCase() ||
    countryFromVatId(taxId) ||
    null;

  if (!taxId) {
    return {
      valid: false,
      code: "OPERATOR_347_ID_MISSING",
      taxId: "",
      name,
      country,
    };
  }

  // Comprobar placeholder sobre el valor original (normalizeTaxId elimina guiones).
  if (isPlaceholderTaxId(rawTaxId) || isPlaceholderTaxId(taxId)) {
    return {
      valid: false,
      code: "OPERATOR_347_ID_PLACEHOLDER",
      taxId,
      name,
      country,
    };
  }

  if (VARIOS_PATTERN.test(name)) {
    return {
      valid: false,
      code: "OPERATOR_347_ID_VARIOS",
      taxId,
      name,
      country,
    };
  }

  const operatorId = opts.entityId ? `${taxId}|${opts.entityId}` : taxId;

  return {
    valid: true,
    operatorId,
    taxId,
    name,
    country,
  };
}

/** Residente español para 347: NIF español o país ES sin prefijo VAT extranjero. */
export function isSpanish347Counterparty(
  taxId: string,
  countryCode?: string | null
): boolean {
  const cc = (countryCode ?? "").trim().toUpperCase();
  const vatCc = countryFromVatId(taxId);
  if (vatCc && vatCc !== "ES") return false;
  if (cc && cc !== "ES" && cc !== "OTHER" && vatCc !== "ES") {
    if (cc.length === 2 && cc !== "ES") return false;
  }
  return true;
}
