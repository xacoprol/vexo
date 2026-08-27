import { round2 } from "@/lib/modelo-390/money";
import type {
  Model180LandlordRecord,
  Model180LeaseRef,
  Model180Summary,
  Model180TraceLine,
  Model180WithholdingRow,
} from "@/lib/modelo-180/types";

export function resolve180PropertySituation(
  lease: Model180LeaseRef | null | undefined
): 1 | 2 | 3 | 4 {
  if (!lease?.cadastralReference?.trim()) return 4;
  // Scope VEXO ordinario: territorio común con RC → 1.
  // País Vasco/Navarra (2/3) no se infieren sin dato foral explícito.
  return 1;
}

export function to180TraceLine(
  w: Model180WithholdingRow,
  quarter: number | null
): Model180TraceLine {
  return {
    withholdingId: w.id,
    leaseId: w.leaseId,
    counterpartyId: w.counterpartyId,
    paymentDate: w.paymentDate
      ? w.paymentDate.toISOString().slice(0, 10)
      : "",
    baseAmount: round2(Number(w.baseAmount) || 0),
    withholdingAmount: round2(Number(w.withholdingAmount) || 0),
    expenseId: w.sourceType === "EXPENSE" ? w.sourceId : null,
    href:
      w.sourceType === "EXPENSE"
        ? `/fiscal/expenses/${w.sourceId}/edit`
        : null,
    quarter,
  };
}

export function compute180Summary(
  records: Model180LandlordRecord[]
): Model180Summary {
  let base = 0;
  let wh = 0;
  const unique = new Set<string>();
  for (const r of records) {
    base = round2(base + r.annualBaseAmount);
    wh = round2(wh + r.annualWithholdingAmount);
    unique.add(r.counterpartyId);
  }
  return {
    totalPayeeRecords: records.length,
    totalBaseAmount: base,
    totalWithholdingAmount: wh,
    uniqueLandlordCount: unique.size,
  };
}

export function assemble180Records(
  rows: Model180WithholdingRow[],
  leasesById: Map<string, Model180LeaseRef>,
  quarterById: Map<string, number>
): Model180LandlordRecord[] {
  const map = new Map<string, Model180LandlordRecord>();

  for (const w of rows) {
    const lease = w.leaseId ? leasesById.get(w.leaseId) ?? null : null;
    const recordKey = `${w.counterpartyId}|${w.leaseId ?? "NO_LEASE"}`;
    let rec = map.get(recordKey);
    if (!rec) {
      const cadastralMissing = !lease?.cadastralReference?.trim();
      rec = {
        recordKey,
        counterpartyId: w.counterpartyId,
        taxId: w.counterparty.taxId,
        name: w.counterparty.name,
        leaseId: w.leaseId,
        propertyAddress: lease?.propertyAddress ?? "—",
        cadastralReference: lease?.cadastralReference ?? null,
        propertySituation: resolve180PropertySituation(lease),
        annualBaseAmount: 0,
        annualWithholdingAmount: 0,
        cadastralMissing,
        certificateReady: Boolean(
          w.counterparty.taxId &&
            lease?.propertyAddress &&
            !cadastralMissing
        ),
        trace: [],
      };
      map.set(recordKey, rec);
    }
    const base = round2(Number(w.baseAmount) || 0);
    const wh = round2(Number(w.withholdingAmount) || 0);
    rec.annualBaseAmount = round2(rec.annualBaseAmount + base);
    rec.annualWithholdingAmount = round2(rec.annualWithholdingAmount + wh);
    rec.trace.push(to180TraceLine(w, quarterById.get(w.id) ?? null));
  }

  return [...map.values()].sort((a, b) =>
    a.taxId.localeCompare(b.taxId) ||
    (a.propertyAddress || "").localeCompare(b.propertyAddress || "")
  );
}
