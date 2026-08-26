export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export const MONEY_TOLERANCE = 0.01;

export function moneyEqual(a: number, b: number, tolerance = MONEY_TOLERANCE): boolean {
  return Math.abs(round2(a) - round2(b)) <= tolerance;
}

export function moneyDelta(a: number, b: number): number {
  return round2(a - b);
}
