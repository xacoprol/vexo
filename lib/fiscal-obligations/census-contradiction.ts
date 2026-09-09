/**
 * Contradicción censo vs libros.
 * Censo = NO no puede borrar evidencia HAS_OPS → no NOT_APPLICABLE silencioso.
 */

import type {
  ObligationStatus,
  ObligationStatusSource,
} from "@/lib/fiscal-obligations/types";

export const CENSUS_CONTRADICTS_BOOKS = "CENSUS_CONTRADICTS_BOOKS" as const;

export type CensusNoWithOpsResolution = {
  /** true si censo NO choca con operaciones reales */
  contradicts: boolean;
  obligationStatus: ObligationStatus;
  statusSource: ObligationStatusSource;
  reasonCodes: string[];
  reason: string;
  warnings: string[];
};

/**
 * Si census=NO y hasOps=true → UNKNOWN bloqueante (no NOT_APPLICABLE).
 * No convierte automáticamente a REQUIRED.
 */
export function resolveCensusNoAgainstBooks(opts: {
  model: string;
  census: "YES" | "NO" | "UNKNOWN";
  hasOps: boolean | null | undefined;
}): CensusNoWithOpsResolution | null {
  if (opts.census !== "NO") return null;
  if (opts.hasOps !== true) {
    return {
      contradicts: false,
      obligationStatus: "NOT_APPLICABLE",
      statusSource: "CENSUS",
      reasonCodes: [`CENSUS_${opts.model}_NO`],
      reason: `Perfil censal: Modelo ${opts.model} = NO.`,
      warnings: [],
    };
  }
  return {
    contradicts: true,
    obligationStatus: "UNKNOWN",
    statusSource: "INSUFFICIENT_DATA",
    reasonCodes: [
      CENSUS_CONTRADICTS_BOOKS,
      `CENSUS_${opts.model}_NO`,
      "HAS_OPS",
    ],
    reason: `Censo ${opts.model} = NO pero los libros muestran operaciones compatibles. Resuelve la contradicción en Ajustes / 036 antes de presentar.`,
    warnings: [
      `Contradicción censo↔libros en modelo ${opts.model}: no se puede concluir NOT_APPLICABLE.`,
    ],
  };
}
