import {
  MODEL190_KEY_G_SUBKEYS,
  type Model190Warning,
  type Model190WithholdingRow,
} from "@/lib/modelo-190/types";

const G_SUB = new Set<string>(MODEL190_KEY_G_SUBKEYS);

/**
 * Clasificación 190: usa clave/subclave persistidas; valida contra diseño lógico.
 * NO inventa G/01 desde kind=PROFESSIONAL.
 */
export function resolve190PerceptionClassification(
  w: Pick<Model190WithholdingRow, "perceptionKey" | "perceptionSubKey" | "id">
): {
  key: string | null;
  subKey: string | null;
  ok: boolean;
  warning: Model190Warning | null;
} {
  const keyRaw = String(w.perceptionKey ?? "")
    .trim()
    .toUpperCase();
  const subRaw = String(w.perceptionSubKey ?? "")
    .trim()
    .padStart(2, "0");

  if (!keyRaw || !w.perceptionSubKey) {
    return {
      key: keyRaw || null,
      subKey: w.perceptionSubKey ? subRaw : null,
      ok: false,
      warning: {
        code: "MODEL190_PERCEPTION_CLASSIFICATION_MISSING",
        message:
          "Falta perceptionKey/perceptionSubKey persistida. No se inventa " +
          "clave G ni subclave desde kind=PROFESSIONAL.",
        withholdingId: w.id,
        severity: "ERROR",
      },
    };
  }

  // Scope VEXO: solo clave G (actividades profesionales).
  if (keyRaw !== "G") {
    return {
      key: keyRaw,
      subKey: subRaw,
      ok: false,
      warning: {
        code: "MODEL190_UNSUPPORTED_SECTION",
        message: `Clave ${keyRaw} fuera del scope VEXO (solo G profesionales).`,
        withholdingId: w.id,
        severity: "ERROR",
      },
    };
  }

  if (!G_SUB.has(subRaw)) {
    return {
      key: keyRaw,
      subKey: subRaw,
      ok: false,
      warning: {
        code: "MODEL190_PERCEPTION_CLASSIFICATION_MISSING",
        message: `Subclave G.${subRaw} no válida según diseño lógico 190 (01–08).`,
        withholdingId: w.id,
        severity: "ERROR",
      },
    };
  }

  return { key: "G", subKey: subRaw, ok: true, warning: null };
}

export function model190RecordKey(
  counterpartyId: string,
  key: string | null,
  subKey: string | null
): string {
  return `${counterpartyId}|${key ?? "?"}|${subKey ?? "??"}`;
}
