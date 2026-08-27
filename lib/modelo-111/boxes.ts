import { round2 } from "@/lib/modelo-390/money";
import type {
  Model111Boxes,
  Model111TraceLine,
  Model111WithholdingRow,
} from "@/lib/modelo-111/types";

function emptyBoxes(): Model111Boxes {
  return {
    box01: 0,
    box02: 0,
    box03: 0,
    box04: 0,
    box05: 0,
    box06: 0,
    box07: 0,
    box08: 0,
    box09: 0,
    box10: 0,
    box11: 0,
    box12: 0,
    box13: 0,
    box14: 0,
    box15: 0,
    box16: 0,
    box17: 0,
    box18: 0,
    box19: 0,
    box20: 0,
    box21: 0,
    box22: 0,
    box23: 0,
    box24: 0,
    box25: 0,
    box26: 0,
    box27: 0,
    box28: 0,
    box29: 0,
    box30: 0,
  };
}

export function to111TraceLine(w: Model111WithholdingRow): Model111TraceLine {
  const payment = w.paymentDate;
  return {
    withholdingId: w.id,
    counterpartyId: w.counterpartyId,
    sourceType: w.sourceType,
    sourceId: w.sourceId,
    professionalName: w.counterparty.name,
    taxId: w.counterparty.taxId,
    paymentDate: payment ? payment.toISOString().slice(0, 10) : "",
    accrualDate: w.accrualDate
      ? w.accrualDate.toISOString().slice(0, 10)
      : null,
    baseAmount: round2(Number(w.baseAmount) || 0),
    withholdingAmount: round2(Number(w.withholdingAmount) || 0),
    rate: Number(w.rate) || 0,
    href:
      w.sourceType === "EXPENSE"
        ? `/fiscal/expenses/${w.sourceId}/edit`
        : null,
  };
}

/**
 * Suma explícita de casillas de retenciones/ingresos a cuenta soportadas.
 * Hoy: solo box09 (actividades económicas dinerarias).
 */
export function compute111Box28(boxes: Pick<Model111Boxes, "box03" | "box06" | "box09" | "box12" | "box15" | "box18" | "box21" | "box24" | "box27">): number {
  return round2(
    (Number(boxes.box03) || 0) +
      (Number(boxes.box06) || 0) +
      (Number(boxes.box09) || 0) +
      (Number(boxes.box12) || 0) +
      (Number(boxes.box15) || 0) +
      (Number(boxes.box18) || 0) +
      (Number(boxes.box21) || 0) +
      (Number(boxes.box24) || 0) +
      (Number(boxes.box27) || 0)
  );
}

export function compute111EconomicActivityBoxes(
  rows: Model111WithholdingRow[]
): {
  boxes: Pick<Model111Boxes, "box07" | "box08" | "box09">;
  traces: Model111TraceLine[];
  uniquePayeeIds: string[];
} {
  const payeeIds = new Set<string>();
  let base = 0;
  let wh = 0;
  const traces: Model111TraceLine[] = [];

  for (const w of rows) {
    payeeIds.add(w.counterpartyId);
    base = round2(base + (Number(w.baseAmount) || 0));
    wh = round2(wh + (Number(w.withholdingAmount) || 0));
    traces.push(to111TraceLine(w));
  }

  return {
    boxes: {
      box07: payeeIds.size,
      box08: base,
      box09: wh,
    },
    traces,
    uniquePayeeIds: [...payeeIds],
  };
}

export function assemble111Boxes(opts: {
  economicRows: Model111WithholdingRow[];
  /** Solo poner 0 en no soportadas si el perfil confirma ausencia (p. ej. hasEmployees=NO). */
  zeroUnsupportedConfirmed: boolean;
}): {
  boxes: Model111Boxes;
  traces: Model111TraceLine[];
} {
  const { boxes: eco, traces } = compute111EconomicActivityBoxes(
    opts.economicRows
  );
  const boxes = emptyBoxes();
  boxes.box07 = eco.box07;
  boxes.box08 = eco.box08;
  boxes.box09 = eco.box09;

  // Casillas no soportadas: 0 solo si confirmado que no hay esas operaciones
  if (!opts.zeroUnsupportedConfirmed) {
    // Permanecen en 0 numérico pero el motor marca supported=false en boxList
  }

  boxes.box28 = compute111Box28(boxes);
  // Ordinaria: sin complementaria
  boxes.box29 = 0;
  boxes.box30 = boxes.box28;

  return { boxes, traces };
}

export function build111BoxList(boxes: Model111Boxes): {
  code: string;
  label: string;
  value: number;
  supported: boolean;
}[] {
  const eco = [
    ["07", "Nº perceptores act. económicas", boxes.box07, true],
    ["08", "Importe percepciones act. económicas", boxes.box08, true],
    ["09", "Retenciones act. económicas", boxes.box09, true],
  ] as const;
  const unsupportedPairs: [string, string, number][] = [
    ["01", "Nº perceptores trabajo", boxes.box01],
    ["02", "Importe percepciones trabajo", boxes.box02],
    ["03", "Retenciones trabajo", boxes.box03],
    ["04", "Nº perceptores trabajo especie", boxes.box04],
    ["05", "Valor percepciones trabajo especie", boxes.box05],
    ["06", "Ingresos a cuenta trabajo especie", boxes.box06],
    ["10", "Nº perceptores act. económicas especie", boxes.box10],
    ["11", "Valor percepciones act. económicas especie", boxes.box11],
    ["12", "Ingresos a cuenta act. económicas especie", boxes.box12],
    ["13", "Nº perceptores premios", boxes.box13],
    ["14", "Importe premios", boxes.box14],
    ["15", "Retenciones premios", boxes.box15],
    ["16", "Nº perceptores premios especie", boxes.box16],
    ["17", "Valor premios especie", boxes.box17],
    ["18", "Ingresos a cuenta premios especie", boxes.box18],
    ["19", "Nº perceptores gains forestales etc.", boxes.box19],
    ["20", "Importe gains forestales etc.", boxes.box20],
    ["21", "Retenciones gains forestales etc.", boxes.box21],
    ["22", "Nº perceptores gains forestales especie", boxes.box22],
    ["23", "Valor gains forestales especie", boxes.box23],
    ["24", "Ingresos a cuenta gains forestales especie", boxes.box24],
    ["25", "Nº perceptores derechos imagen", boxes.box25],
    ["26", "Contrapestaciones derechos imagen", boxes.box26],
    ["27", "Ingresos a cuenta derechos imagen", boxes.box27],
  ];

  const list = [
    ...unsupportedPairs.map(([code, label, value]) => ({
      code,
      label,
      value,
      supported: false as const,
    })),
    ...eco.map(([code, label, value, supported]) => ({
      code,
      label,
      value,
      supported,
    })),
    {
      code: "28",
      label: "Suma de retenciones e ingresos a cuenta",
      value: boxes.box28,
      supported: true,
    },
    {
      code: "29",
      label: "Resultados a ingresar de anteriores autoliquidaciones",
      value: boxes.box29,
      supported: false,
    },
    {
      code: "30",
      label: "Resultado a ingresar",
      value: boxes.box30,
      supported: true,
    },
  ];
  return list.sort((a, b) => Number(a.code) - Number(b.code));
}
