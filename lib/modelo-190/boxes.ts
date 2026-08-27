import { round2 } from "@/lib/modelo-390/money";
import {
  model190RecordKey,
  resolve190PerceptionClassification,
} from "@/lib/modelo-190/classify";
import type {
  Model190PayeeRecord,
  Model190Summary,
  Model190TraceLine,
  Model190WithholdingRow,
} from "@/lib/modelo-190/types";

export function to190TraceLine(
  w: Model190WithholdingRow,
  quarter: number | null
): Model190TraceLine {
  return {
    withholdingId: w.id,
    counterpartyId: w.counterpartyId,
    sourceType: w.sourceType,
    sourceId: w.sourceId,
    paymentDate: w.paymentDate
      ? w.paymentDate.toISOString().slice(0, 10)
      : "",
    baseAmount: round2(Number(w.baseAmount) || 0),
    withholdingAmount: round2(Number(w.withholdingAmount) || 0),
    rate: Number(w.rate) || 0,
    href:
      w.sourceType === "EXPENSE"
        ? `/fiscal/expenses/${w.sourceId}/edit`
        : null,
    quarter,
  };
}

/**
 * Resumen oficial tipo 1 — NO reutiliza box07 del 111.
 * totalPerceptionRecords = nº registros tipo 2 (clave/subclave), no personas únicas.
 */
export function compute190Summary(
  records: Model190PayeeRecord[]
): Model190Summary {
  let totalCash = 0;
  let totalWh = 0;
  const unique = new Set<string>();
  for (const r of records) {
    totalCash = round2(totalCash + r.cashPerceptionAmount);
    totalWh = round2(totalWh + r.withholdingAmount);
    unique.add(r.counterpartyId);
  }
  return {
    totalPerceptionRecords: records.length,
    totalCashPerceptionAmount: totalCash,
    totalWithholdingAmount: totalWh,
    uniquePayeeCount: unique.size,
  };
}

export function assemble190Records(
  rows: Model190WithholdingRow[],
  quarterByWithholdingId: Map<string, number>
): Model190PayeeRecord[] {
  const map = new Map<string, Model190PayeeRecord>();

  for (const w of rows) {
    const cls = resolve190PerceptionClassification(w);
    const recordKey = model190RecordKey(
      w.counterpartyId,
      cls.key,
      cls.subKey
    );
    let rec = map.get(recordKey);
    if (!rec) {
      rec = {
        recordKey,
        counterpartyId: w.counterpartyId,
        taxId: w.counterparty.taxId,
        name: w.counterparty.name,
        key: cls.key,
        subKey: cls.subKey,
        cashPerceptionAmount: 0,
        withholdingAmount: 0,
        classificationMissing: !cls.ok,
        certificateReady: Boolean(
          cls.ok && w.counterparty.taxId && w.counterparty.name
        ),
        trace: [],
      };
      map.set(recordKey, rec);
    }
    const base = round2(Number(w.baseAmount) || 0);
    const wh = round2(Number(w.withholdingAmount) || 0);
    rec.cashPerceptionAmount = round2(rec.cashPerceptionAmount + base);
    rec.withholdingAmount = round2(rec.withholdingAmount + wh);
    if (!cls.ok) rec.classificationMissing = true;
    if (rec.classificationMissing) rec.certificateReady = false;
    rec.trace.push(
      to190TraceLine(w, quarterByWithholdingId.get(w.id) ?? null)
    );
  }

  return [...map.values()].sort((a, b) =>
    a.taxId.localeCompare(b.taxId) || a.recordKey.localeCompare(b.recordKey)
  );
}
