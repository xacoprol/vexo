import { round2 } from "@/lib/modelo-390/money";
import type {
  Model115Boxes,
  Model115LeaseRef,
  Model115TraceLine,
  Model115WithholdingRow,
} from "@/lib/modelo-115/types";

export function empty115Boxes(): Model115Boxes {
  return { box01: 0, box02: 0, box03: 0, box04: 0, box05: 0 };
}

export function to115TraceLine(
  w: Model115WithholdingRow,
  lease?: Model115LeaseRef | null
): Model115TraceLine {
  const payment = w.paymentDate;
  return {
    withholdingId: w.id,
    leaseId: w.leaseId ?? lease?.id ?? null,
    counterpartyId: w.counterpartyId,
    landlordName: w.counterparty.name,
    taxId: w.counterparty.taxId,
    paymentDate: payment ? payment.toISOString().slice(0, 10) : "",
    accrualDate: w.accrualDate
      ? w.accrualDate.toISOString().slice(0, 10)
      : null,
    baseAmount: round2(Number(w.baseAmount) || 0),
    withholdingAmount: round2(Number(w.withholdingAmount) || 0),
    rate: Number(w.rate) || 0,
    expenseId: w.sourceType === "EXPENSE" ? w.sourceId : null,
    href:
      w.sourceType === "EXPENSE"
        ? `/fiscal/expenses/${w.sourceId}/edit`
        : null,
    propertyAddress: lease?.propertyAddress ?? null,
  };
}

/**
 * Casillas oficiales 115.
 * box04=0 en ordinaria (complementaria no automatizada).
 * box05 = box03 − box04.
 */
export function assemble115Boxes(opts: {
  rows: Model115WithholdingRow[];
  leasesById?: Map<string, Model115LeaseRef>;
}): {
  boxes: Model115Boxes;
  traces: Model115TraceLine[];
  uniqueLandlordIds: string[];
} {
  const leasesById = opts.leasesById ?? new Map();
  const landlordIds = new Set<string>();
  let base = 0;
  let wh = 0;
  const traces: Model115TraceLine[] = [];

  for (const w of opts.rows) {
    landlordIds.add(w.counterpartyId);
    base = round2(base + (Number(w.baseAmount) || 0));
    wh = round2(wh + (Number(w.withholdingAmount) || 0));
    const lease = w.leaseId ? leasesById.get(w.leaseId) : null;
    traces.push(to115TraceLine(w, lease));
  }

  const boxes: Model115Boxes = {
    box01: landlordIds.size,
    box02: base,
    box03: wh,
    box04: 0,
    box05: round2(wh - 0),
  };

  return { boxes, traces, uniqueLandlordIds: [...landlordIds] };
}

export function build115BoxList(boxes: Model115Boxes): {
  code: string;
  label: string;
  value: number;
  supported: boolean;
}[] {
  return [
    {
      code: "01",
      label: "Número de perceptores",
      value: boxes.box01,
      supported: true,
    },
    {
      code: "02",
      label: "Base de las retenciones e ingresos a cuenta",
      value: boxes.box02,
      supported: true,
    },
    {
      code: "03",
      label: "Retenciones e ingresos a cuenta",
      value: boxes.box03,
      supported: true,
    },
    {
      code: "04",
      label: "Resultados a ingresar de anteriores (complementaria)",
      value: boxes.box04,
      supported: false,
    },
    {
      code: "05",
      label: "Resultado a ingresar",
      value: boxes.box05,
      supported: true,
    },
  ];
}

/** Alias explícito pedido por el brief. */
export function computeModelo115(opts: {
  rows: Model115WithholdingRow[];
  leasesById?: Map<string, Model115LeaseRef>;
}): ReturnType<typeof assemble115Boxes> {
  return assemble115Boxes(opts);
}
