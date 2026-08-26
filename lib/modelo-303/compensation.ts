export type Presented303Carry = {
  /** Casilla 87 — saldo de periodos anteriores pendiente. */
  box87: number;
  /** Magnitud interna: max(0, −box71) si compensación (≠ casilla 70). */
  newNegativeBalance: number;
  /** Arrastre interno al siguiente periodo (87 + newNegativeBalance). */
  totalAvailableNextPeriod: number;
  /** true si se estimó desde result legacy sin casillas 69/71. */
  legacyEstimate?: boolean;
};

/** Saldo a compensar desde un 303 presentado. */
export function carryFromPresented303(row: {
  result: unknown;
  boxes: unknown;
}): Presented303Carry {
  const boxes = parseFilingBoxes(row.boxes);
  const box87Val = boxes.find((b) => b.code === "87");
  const box71Val = boxes.find((b) => b.code === "71");
  const box69Val = boxes.find((b) => b.code === "69");

  const box87 = box87Val ? round2(Math.max(0, box87Val.value)) : 0;

  let newNegativeBalance = 0;
  if (box71Val != null && Number.isFinite(box71Val.value) && box71Val.value < 0) {
    newNegativeBalance = round2(-box71Val.value);
  } else if (
    box69Val != null &&
    Number.isFinite(box69Val.value) &&
    box69Val.value < 0 &&
    box71Val == null
  ) {
    newNegativeBalance = round2(-box69Val.value);
  }

  const hasStructuredBoxes =
    box87Val != null || box71Val != null || box69Val != null;

  if (hasStructuredBoxes) {
    return {
      box87,
      newNegativeBalance,
      totalAvailableNextPeriod: round2(box87 + newNegativeBalance),
      legacyEstimate: false,
    };
  }

  const result = Number(row.result);
  if (result < 0) {
    const legacyNegative = round2(-result);
    return {
      box87: 0,
      newNegativeBalance: legacyNegative,
      totalAvailableNextPeriod: legacyNegative,
      legacyEstimate: true,
    };
  }

  return {
    box87: 0,
    newNegativeBalance: 0,
    totalAvailableNextPeriod: 0,
    legacyEstimate: false,
  };
}

export function presented303CarryToPriorCompensation(
  carry: Presented303Carry
): number {
  return carry.totalAvailableNextPeriod;
}

export function parseFilingBoxes(
  raw: unknown
): { code: string; value: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((b) => {
    const o = b as Record<string, unknown>;
    return {
      code: String(o.code ?? "").trim(),
      value: Number(o.value) || 0,
    };
  });
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
