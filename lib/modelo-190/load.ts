import { prisma } from "@/lib/prisma";
import { buildModel111 } from "@/lib/modelo-111/engine";
import { parse111PresentedSnapshot } from "@/lib/modelo-111/presentation";
import { getPresentedFiling } from "@/lib/fiscal-filings";
import type { FiscalQuarter } from "@/lib/fiscal";
import { buildModel190 } from "@/lib/modelo-190/engine";
import type { Quarter111SnapshotInput } from "@/lib/modelo-190/reconcile";
import type {
  Model190Result,
  Model190WithholdingRow,
} from "@/lib/modelo-190/types";
import {
  WITHHOLDING_DIRECTION,
  WITHHOLDING_KIND,
} from "@/lib/fiscal-withholding";

async function loadQuarter111ForReconcile(
  year: number,
  quarter: FiscalQuarter,
  withholdings: Model190WithholdingRow[]
): Promise<Quarter111SnapshotInput> {
  const presented = await getPresentedFiling("111", year, quarter);
  const snap = presented
    ? parse111PresentedSnapshot(presented.rawExtract)
    : null;

  const draft = buildModel111({
    year,
    quarter,
    withholdings: withholdings.map((w) => ({
      ...w,
      counterparty: w.counterparty,
    })),
    censusModel111: "YES",
  });

  if (snap) {
    return {
      quarter,
      perceptionAmount: Number(snap.boxes.box08) || 0,
      withholdingAmount: Number(snap.boxes.box09) || 0,
      presented: true,
      withholdingIds: draft.includedWithholdingIds
        ? // Model111Result doesn't have includedWithholdingIds - use trace
          draft.trace.box08.map((t) => t.withholdingId)
        : draft.trace.box08.map((t) => t.withholdingId),
      byCounterparty: (snap.payees ?? []).map((p) => ({
        counterpartyId: p.counterpartyId,
        name: p.name,
        baseAmount: p.baseAmount,
        withholdingAmount: p.withholdingAmount,
      })),
    };
  }

  return {
    quarter,
    perceptionAmount: draft.boxes.box08,
    withholdingAmount: draft.boxes.box09,
    presented: false,
    withholdingIds: draft.trace.box08.map((t) => t.withholdingId),
    byCounterparty: draft.payees.map((p) => ({
      counterpartyId: p.counterpartyId,
      name: p.name,
      baseAmount: p.baseAmount,
      withholdingAmount: p.withholdingAmount,
    })),
  };
}

export async function buildModelo190Draft(year: number): Promise<Model190Result> {
  const [settings, rows] = await Promise.all([
    prisma.companySettings.findFirst({
      select: {
        censusModel190: true,
        censusModel111: true,
        hasEmployees: true,
      },
    }),
    prisma.fiscalWithholding.findMany({
      where: {
        direction: WITHHOLDING_DIRECTION.PRACTICED,
        kind: WITHHOLDING_KIND.PROFESSIONAL,
      },
      include: {
        counterparty: {
          select: {
            id: true,
            name: true,
            taxId: true,
            normalizedTaxId: true,
            kind: true,
            countryCode: true,
            requiresReview: true,
          },
        },
      },
      orderBy: { paymentDate: "asc" },
    }),
  ]);

  const withholdings: Model190WithholdingRow[] = rows.map((w) => ({
    id: w.id,
    direction: w.direction,
    kind: w.kind,
    status: w.status,
    rectifiesId: w.rectifiesId,
    counterpartyId: w.counterpartyId,
    sourceType: w.sourceType,
    sourceId: w.sourceId,
    baseAmount: Number(w.baseAmount),
    rate: w.rate,
    withholdingAmount: Number(w.withholdingAmount),
    accrualDate: w.accrualDate,
    paymentDate: w.paymentDate,
    year: w.year,
    quarter: w.quarter,
    perceptionKey: w.perceptionKey,
    perceptionSubKey: w.perceptionSubKey,
    counterparty: w.counterparty,
  }));

  const quarters111 = await Promise.all(
    ([1, 2, 3, 4] as FiscalQuarter[]).map((q) =>
      loadQuarter111ForReconcile(year, q, withholdings)
    )
  );

  return buildModel190({
    year,
    withholdings,
    censusModel190: settings?.censusModel190,
    censusModel111: settings?.censusModel111,
    hasEmployees: settings?.hasEmployees,
    quarters111,
  });
}
