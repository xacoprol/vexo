import { prisma } from "@/lib/prisma";
import { buildModelo347Draft, buildModelo349Draft } from "@/lib/fiscal-347-349";
import type { FiscalQuarter } from "@/lib/fiscal";
import { CENSUS_SETTINGS_SELECT } from "@/lib/fiscal-obligations/census-profile";
import {
  buildFiscalObligationsFromSnapshot,
  type FiscalObligationsSnapshot,
} from "@/lib/fiscal-obligations/engine";
import type { FiscalObligationsResult } from "@/lib/fiscal-obligations/types";
import {
  WITHHOLDING_DIRECTION,
  WITHHOLDING_KIND,
  WITHHOLDING_STATUS,
} from "@/lib/fiscal-withholding";
import { resolve111WithholdingPeriod } from "@/lib/modelo-111/period";
import { resolve115WithholdingPeriod } from "@/lib/modelo-115/period";

export type BuildFiscalObligationsInput = {
  year: number;
  quarter?: FiscalQuarter;
  month?: number;
  now?: Date;
};

export async function buildFiscalObligations(
  input: BuildFiscalObligationsInput
): Promise<FiscalObligationsResult> {
  const now = input.now ?? new Date();
  const year = input.year;
  const quarter = input.quarter ?? null;

  const [
    settings,
    filings,
    withholdings,
    professionalRows,
    rentRows,
    leaseUnknownCount,
    activeLeaseCount,
    draft347,
    ...drafts349
  ] = await Promise.all([
    prisma.companySettings.findFirst({ select: CENSUS_SETTINGS_SELECT }),
    prisma.fiscalFiling.findMany({
      where: { year },
      select: { id: true, modelType: true, year: true, quarter: true },
    }),
    prisma.fiscalWithholding.findMany({
      where: {
        year,
        direction: WITHHOLDING_DIRECTION.PRACTICED,
        status: WITHHOLDING_STATUS.ACTIVE,
      },
      select: { kind: true },
    }),
    prisma.fiscalWithholding.findMany({
      where: {
        direction: WITHHOLDING_DIRECTION.PRACTICED,
        kind: WITHHOLDING_KIND.PROFESSIONAL,
        status: WITHHOLDING_STATUS.ACTIVE,
      },
      select: { paymentDate: true, accrualDate: true },
    }),
    prisma.fiscalWithholding.findMany({
      where: {
        direction: WITHHOLDING_DIRECTION.PRACTICED,
        kind: WITHHOLDING_KIND.RENT,
        status: WITHHOLDING_STATUS.ACTIVE,
      },
      select: { paymentDate: true, accrualDate: true },
    }),
    prisma.businessPremisesLease.count({
      where: { active: true, withholdingStatus: "UNKNOWN" },
    }),
    prisma.businessPremisesLease.count({ where: { active: true } }),
    buildModelo347Draft(year),
    ...([1, 2, 3, 4] as FiscalQuarter[]).map((q) =>
      buildModelo349Draft(year, q)
    ),
  ]);

  const model349HasOps: Partial<Record<FiscalQuarter, boolean>> = {};
  for (let i = 0; i < 4; i++) {
    const q = (i + 1) as FiscalQuarter;
    model349HasOps[q] = Boolean(drafts349[i]?.hasOps);
  }

  const model111HasOps: Partial<Record<FiscalQuarter, boolean>> = {
    1: false,
    2: false,
    3: false,
    4: false,
  };
  for (const w of professionalRows) {
    const resolved = resolve111WithholdingPeriod({
      paymentDate: w.paymentDate,
      accrualDate: w.accrualDate,
    });
    if (!resolved.ok || resolved.year !== year) continue;
    model111HasOps[resolved.quarter] = true;
  }

  const model115HasOps: Partial<Record<FiscalQuarter, boolean>> = {
    1: false,
    2: false,
    3: false,
    4: false,
  };
  for (const w of rentRows) {
    const resolved = resolve115WithholdingPeriod({
      paymentDate: w.paymentDate,
      accrualDate: w.accrualDate,
    });
    if (!resolved.ok || resolved.year !== year) continue;
    model115HasOps[resolved.quarter] = true;
  }

  const hasPracticedProfessionalWithholding = withholdings.some(
    (w) => w.kind === WITHHOLDING_KIND.PROFESSIONAL
  );
  const hasPracticedRentWithholding = withholdings.some(
    (w) => w.kind === WITHHOLDING_KIND.RENT
  );

  const hasDeclarableOps = (draft347?.operators?.length ?? 0) > 0;

  const snap: FiscalObligationsSnapshot = {
    year,
    quarter,
    now,
    settings,
    filings: filings.map((f) => ({
      id: f.id,
      modelType: f.modelType,
      year: f.year,
      quarter: f.quarter,
    })),
    model349HasOps,
    model347HasDeclarableOps: hasDeclarableOps,
    hasPracticedProfessionalWithholding,
    hasPracticedRentWithholding,
    hasActiveBusinessPremisesLease: activeLeaseCount > 0,
    model111HasOps,
    model111Periodicity: settings?.model111Periodicity ?? "UNKNOWN",
    model115HasOps,
    model115Periodicity: settings?.model115Periodicity ?? "UNKNOWN",
    hasLeaseWithholdingUnknown: leaseUnknownCount > 0,
  };

  return buildFiscalObligationsFromSnapshot(snap);
}
