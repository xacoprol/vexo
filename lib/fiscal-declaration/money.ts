/**
 * Representación monetaria canónica para declaraciones (string decimal).
 * Evita float en serialization. No altera motores.
 */

import { round2 } from "@/lib/modelo-390/money";

/** "736.07" | null — siempre 2 decimales si número. */
export function serializeMoney(value: unknown): string | null {
  if (value == null || value === "") return null;
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(",", "."))
        : Number(value);
  if (!Number.isFinite(n)) return null;
  return round2(n).toFixed(2);
}

export function parseMoney(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return round2(n);
}

export function serializeBoxes(
  boxes: Record<string, number | string | null | undefined>
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  const keys = Object.keys(boxes).sort();
  for (const k of keys) {
    out[k] = serializeMoney(boxes[k]);
  }
  return out;
}

/** Comparación tolerante 0.01 entre string money y número. */
export function moneyStringsEqual(
  a: string | null,
  b: number | string | null | undefined
): boolean {
  const na = parseMoney(a);
  const nb =
    typeof b === "number"
      ? round2(b)
      : typeof b === "string"
        ? parseMoney(b)
        : null;
  if (na == null && nb == null) return true;
  if (na == null || nb == null) return false;
  return Math.abs(na - nb) <= 0.01;
}
