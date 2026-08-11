/** Claves habituales modelo 347 (operaciones con terceros). */
export const OPERATION_KEY_347_OPTIONS = [
  { value: "B", label: "B — Ventas / entregas" },
  { value: "A", label: "A — Compras / adquisiciones" },
] as const;

const EU_COUNTRY_CODES = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "EL",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "SE",
]);

export function isEuCountryCode(code: string | null | undefined): boolean {
  const cc = String(code ?? "")
    .trim()
    .toUpperCase();
  if (!cc || cc === "ES" || cc === "OTHER") return false;
  return EU_COUNTRY_CODES.has(cc);
}

export function parseOperationKey347(raw: unknown): string | null {
  const v = String(raw ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 1);
  if (!v) return null;
  return v;
}

/**
 * Aviso de coherencia IVA ↔ país del cliente.
 * No bloquea por defecto; create/update pueden usar `block: true`.
 */
export function invoiceVatCountryWarning(opts: {
  vatOperationType: string;
  clientCountryCode: string | null | undefined;
}): string | null {
  const op = String(opts.vatOperationType ?? "SUJETA").toUpperCase();
  const cc = String(opts.clientCountryCode ?? "ES")
    .trim()
    .toUpperCase() || "ES";
  const eu = isEuCountryCode(cc);

  if (op === "INTRACOMUNITARIA" && (cc === "ES" || cc === "OTHER" || !eu)) {
    return "Operación intracomunitaria con cliente no UE (o España). Revisa el país del cliente o el tipo de IVA.";
  }
  if (
    (op === "SUJETA" || op === "EXENTA") &&
    eu &&
    cc !== "ES"
  ) {
    return "Cliente UE con operación peninsular. Si es entrega intracomunitaria, marca Intracomunitaria (0 % IVA).";
  }
  return null;
}
