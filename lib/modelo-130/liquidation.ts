import type { Model130Boxes, Model130TraceLine } from "@/lib/modelo-130/types";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type Model130LiquidationInput = {
  box07: number;
  /** Sección II agrícola — 0 si no aplica. */
  box11?: number;
  box13: number;
  box13Lines?: Model130TraceLine[];
  unusedNegativeResults: number;
  box16?: number;
  box16Lines?: Model130TraceLine[];
  /** Autoliquidación complementaria — pagos anteriores mismo periodo. */
  box18?: number;
};

export type Model130LiquidationResult = {
  boxes: Pick<
    Model130Boxes,
    "box07" | "box11" | "box12" | "box13" | "box14" | "box15" | "box16" | "box17" | "box18" | "box19"
  >;
  trace: {
    box13: Model130TraceLine[];
    box15: Model130TraceLine[];
    box16: Model130TraceLine[];
  };
  unusedNegativeResultsAfter: number;
};

/**
 * Cadena oficial casillas 07→19 (instrucciones AEAT modelo 130).
 * box12 = max(0, box07 + box11).
 */
export function computeModel130Liquidation(
  input: Model130LiquidationInput
): Model130LiquidationResult {
  const box07 = round2(input.box07);
  const box11 = round2(input.box11 ?? 0);
  const box12 = round2(Math.max(0, box07 + box11));
  const box13 = round2(Math.max(0, input.box13));
  const box14 = round2(box12 - box13);

  let box15 = 0;
  const box15Lines: Model130TraceLine[] = [];
  if (box14 > 0 && input.unusedNegativeResults > 0) {
    box15 = round2(Math.min(box14, input.unusedNegativeResults));
    box15Lines.push({
      sourceType: "negative_carry",
      description: "Compensación resultados negativos trimestres anteriores",
      amount: box15,
    });
  }

  let box16 = round2(Math.max(0, input.box16 ?? 0));
  if (box14 <= 0) {
    box16 = 0;
  } else if (box16 > 0) {
    box16 = round2(Math.min(box16, Math.max(0, box14 - box15)));
  }

  const box17 = round2(box14 - box15 - box16);
  const box18 = round2(Math.max(0, input.box18 ?? 0));
  const box19 = round2(box17 - box18);

  let unusedNegativeResultsAfter = input.unusedNegativeResults;
  if (box19 < 0) {
    unusedNegativeResultsAfter = round2(
      unusedNegativeResultsAfter + Math.abs(box19)
    );
  } else if (box15 > 0) {
    unusedNegativeResultsAfter = round2(
      Math.max(0, unusedNegativeResultsAfter - box15)
    );
  }

  return {
    boxes: {
      box07,
      box11,
      box12,
      box13,
      box14,
      box15,
      box16,
      box17,
      box18,
      box19,
    },
    trace: {
      box13: input.box13Lines ?? [],
      box15: box15Lines,
      box16: input.box16Lines ?? [],
    },
    unusedNegativeResultsAfter,
  };
}
