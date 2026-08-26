import {
  countryFromVatId,
  isPlaceholderTaxId,
  normalizeTaxId,
} from "@/lib/fiscal-347-349";

export type EuVatIdResolution =
  | {
      ok: true;
      vatId: string;
      country: string;
      normalizedFrom: string;
    }
  | {
      ok: false;
      code: "EU_VAT_ID_MISSING" | "EU_VAT_ID_PLACEHOLDER" | "EU_VAT_ID_INVALID";
      raw: string;
      countryHint: string | null;
    };

const EU_VAT_BODY = /^[A-Z]{2}[A-Z0-9]{2,12}$/;

/**
 * Resuelve el NIF-IVA del operador intracomunitario.
 * No inventa identificadores: si falta, devuelve error explícito.
 */
export function resolveEuVatId(
  raw: string | null | undefined,
  countryCode?: string | null
): EuVatIdResolution {
  const normalized = normalizeTaxId(raw);
  const countryHint =
    (countryCode ?? "").trim().toUpperCase() ||
    countryFromVatId(normalized) ||
    null;

  if (!normalized) {
    return {
      ok: false,
      code: "EU_VAT_ID_MISSING",
      raw: String(raw ?? ""),
      countryHint,
    };
  }

  if (isPlaceholderTaxId(normalized)) {
    return {
      ok: false,
      code: "EU_VAT_ID_PLACEHOLDER",
      raw: normalized,
      countryHint,
    };
  }

  // España no es operador intracomunitario en 349 (salvo claves especiales no implementadas).
  if (normalized.startsWith("ES") && normalized.length >= 4) {
    return {
      ok: false,
      code: "EU_VAT_ID_INVALID",
      raw: normalized,
      countryHint: "ES",
    };
  }

  const country = countryFromVatId(normalized) ?? countryHint;
  if (!country || country === "ES") {
    return {
      ok: false,
      code: "EU_VAT_ID_INVALID",
      raw: normalized,
      countryHint,
    };
  }

  if (!EU_VAT_BODY.test(normalized)) {
    return {
      ok: false,
      code: "EU_VAT_ID_INVALID",
      raw: normalized,
      countryHint: country,
    };
  }

  return {
    ok: true,
    vatId: normalized,
    country,
    normalizedFrom: String(raw ?? ""),
  };
}

export function euVatIdWarningMessage(
  code: EuVatIdResolution extends { ok: false; code: infer C } ? C : never
): string {
  switch (code) {
    case "EU_VAT_ID_MISSING":
      return "Falta NIF-IVA del operador intracomunitario.";
    case "EU_VAT_ID_PLACEHOLDER":
      return "NIF-IVA provisional (PEND-…) — completar antes de declarar en 349.";
    case "EU_VAT_ID_INVALID":
      return "NIF-IVA con formato claramente inválido para operador UE.";
    default:
      return "NIF-IVA no válido para 349.";
  }
}
