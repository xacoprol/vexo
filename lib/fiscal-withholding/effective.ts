import { WITHHOLDING_STATUS } from "@/lib/fiscal-withholding/types";

/**
 * Semántica única ACTIVE / RECTIFIED / SUPERSEDED para 111, 115, 190 y 180.
 * No cuenta SUPERSEDED ni RECTIFIED; si un ACTIVE es rectificado por otro ACTIVE,
 * solo cuenta el sustituto (evita doble cómputo trimestral/anual).
 */
export function isEffectiveWithholdingStatus(
  row: { id: string; status: string; rectifiesId: string | null },
  peers: { id: string; status: string; rectifiesId: string | null }[]
): boolean {
  if (
    row.status === WITHHOLDING_STATUS.SUPERSEDED ||
    row.status === WITHHOLDING_STATUS.RECTIFIED
  ) {
    return false;
  }
  if (row.status !== WITHHOLDING_STATUS.ACTIVE) return false;
  const supersededByActive = peers.some(
    (other) =>
      other.status === WITHHOLDING_STATUS.ACTIVE &&
      other.rectifiesId === row.id &&
      other.id !== row.id
  );
  return !supersededByActive;
}

export function filterEffectiveWithholdings<
  T extends { id: string; status: string; rectifiesId: string | null },
>(rows: T[]): T[] {
  return rows.filter((w) => isEffectiveWithholdingStatus(w, rows));
}
