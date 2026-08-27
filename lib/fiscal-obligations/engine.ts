/**
 * Motor maestro de obligaciones fiscales (Fase 9.2).
 */

import type { FiscalQuarter } from "@/lib/fiscal";
import { adapt111Obligation } from "@/lib/fiscal-obligations/adapters/model-111";
import { adapt115Obligation } from "@/lib/fiscal-obligations/adapters/model-115";
import { adapt180Obligation } from "@/lib/fiscal-obligations/adapters/model-180";
import { adapt190Obligation } from "@/lib/fiscal-obligations/adapters/model-190";
import { adapt130Obligation } from "@/lib/fiscal-obligations/adapters/model-130";
import { adapt303Obligation } from "@/lib/fiscal-obligations/adapters/model-303";
import { adapt347Obligation } from "@/lib/fiscal-obligations/adapters/model-347";
import { adapt349Obligation } from "@/lib/fiscal-obligations/adapters/model-349";
import { adapt390Obligation } from "@/lib/fiscal-obligations/adapters/model-390";
import {
  buildFiscalCensusProfileFromSettings,
  type CensusSettingsRow,
} from "@/lib/fiscal-obligations/census-profile";
import {
  compareCensusVsOperationalSignals,
} from "@/lib/fiscal-obligations/compare-census";
import { assessCensusProfileCompleteness } from "@/lib/fiscal-obligations/completeness";
import type {
  CensusMismatch,
  FiscalObligationEntry,
  FiscalObligationsResult,
} from "@/lib/fiscal-obligations/types";

export type FilingRef = {
  modelType: string;
  year: number;
  quarter: number | null;
  id: string;
};

export type FiscalObligationsSnapshot = {
  year: number;
  quarter?: FiscalQuarter | null;
  now?: Date;
  settings: CensusSettingsRow | null;
  filings: FilingRef[];
  /** Ingresos YTD y con retención para 130 (opcional). */
  incomeBaseYtd?: number;
  incomeWithWithholdingYtd?: number;
  /** hasOps por trimestre 349 */
  model349HasOps?: Partial<Record<FiscalQuarter, boolean>>;
  /** 347: hay operadores declarables */
  model347HasDeclarableOps?: boolean | null;
  /** 390 precomputed */
  model390Status?: "REQUIRED" | "EXEMPT" | "UNKNOWN";
  model390Reasons?: string[];
  /** Señales withholding */
  hasPracticedProfessionalWithholding?: boolean;
  hasPracticedRentWithholding?: boolean;
  /** Hay BusinessPremisesLease.active */
  hasActiveBusinessPremisesLease?: boolean;
  /**
   * Operaciones 111 por trimestre según paymentDate (null = desconocido).
   * Preferido frente al booleano anual hasPracticedProfessionalWithholding.
   */
  model111HasOps?: Partial<Record<FiscalQuarter, boolean | null>>;
  model111Periodicity?: string | null;
  /**
   * Operaciones 115 por trimestre según paymentDate (RENT).
   */
  model115HasOps?: Partial<Record<FiscalQuarter, boolean | null>>;
  model115Periodicity?: string | null;
  hasLeaseWithholdingUnknown?: boolean;
};

function findFiling(
  filings: FilingRef[],
  model: string,
  year: number,
  quarter: number | null
): FilingRef | null {
  return (
    filings.find(
      (f) =>
        f.modelType === model &&
        f.year === year &&
        (quarter == null ? f.quarter == null : f.quarter === quarter)
    ) ?? null
  );
}

/**
 * Construcción pura desde snapshot (tests + Health).
 */
export function buildFiscalObligationsFromSnapshot(
  snap: FiscalObligationsSnapshot
): FiscalObligationsResult {
  const now = snap.now ?? new Date();
  const year = snap.year;
  const quarter = snap.quarter ?? null;
  const mode = quarter != null ? "quarter" : "annual";
  const profile = buildFiscalCensusProfileFromSettings(snap.settings);
  const mismatches: CensusMismatch[] = [];
  const warnings: string[] = [];
  const obligations: FiscalObligationEntry[] = [];

  const opMismatches = compareCensusVsOperationalSignals(profile, {
    hasPracticedProfessionalWithholding: Boolean(
      snap.hasPracticedProfessionalWithholding
    ),
    hasPracticedRentWithholding: Boolean(snap.hasPracticedRentWithholding),
    hasActiveBusinessPremisesLease: Boolean(
      snap.hasActiveBusinessPremisesLease
    ),
  });
  mismatches.push(...opMismatches);

  const quarters: FiscalQuarter[] =
    quarter != null ? [quarter] : [1, 2, 3, 4];

  for (const q of quarters) {
    const f130 = findFiling(snap.filings, "130", year, q);
    const a130 = adapt130Obligation({
      profile,
      year,
      quarter: q,
      incomeBaseYtd: snap.incomeBaseYtd ?? 0,
      incomeWithWithholdingYtd: snap.incomeWithWithholdingYtd ?? 0,
      filed: Boolean(f130),
      filingId: f130?.id ?? null,
      now,
    });
    obligations.push(a130.entry);
    if (a130.mismatch) mismatches.push(a130.mismatch);

    const f303 = findFiling(snap.filings, "303", year, q);
    const a303 = adapt303Obligation({
      profile,
      year,
      quarter: q,
      filed: Boolean(f303),
      filingId: f303?.id ?? null,
      now,
    });
    obligations.push(a303.entry);
    if (a303.mismatch) mismatches.push(a303.mismatch);

    const hasOps349 =
      snap.model349HasOps?.[q] != null ? snap.model349HasOps[q]! : null;
    const f349 = findFiling(snap.filings, "349", year, q);
    const a349 = adapt349Obligation({
      profile,
      year,
      quarter: q,
      hasOps: hasOps349,
      filed: Boolean(f349),
      filingId: f349?.id ?? null,
      now,
    });
    obligations.push(a349.entry);
    if (a349.mismatch) mismatches.push(a349.mismatch);

    // 111 trimestral — motor assess111FilingObligation (Fase 9.4)
    const hasOps111 =
      snap.model111HasOps?.[q] != null
        ? snap.model111HasOps[q]!
        : snap.hasPracticedProfessionalWithholding == null
          ? null
          : Boolean(snap.hasPracticedProfessionalWithholding);

    const f111 = findFiling(snap.filings, "111", year, q);
    const a111 = adapt111Obligation({
      profile,
      year,
      quarter: q,
      hasRelevantPayments: hasOps111,
      model111Periodicity:
        snap.model111Periodicity ??
        (snap.settings as { model111Periodicity?: string } | null)
          ?.model111Periodicity,
      filed: Boolean(f111),
      filingId: f111?.id ?? null,
      now,
    });
    obligations.push(a111.entry);
    if (a111.mismatch) mismatches.push(a111.mismatch);

    // 115 trimestral — motor assess115FilingObligation (Fase 9.5)
    const hasOps115 =
      snap.model115HasOps?.[q] != null
        ? snap.model115HasOps[q]!
        : snap.hasPracticedRentWithholding == null
          ? null
          : Boolean(snap.hasPracticedRentWithholding);

    const f115 = findFiling(snap.filings, "115", year, q);
    const a115 = adapt115Obligation({
      profile,
      year,
      quarter: q,
      hasRelevantPayments: hasOps115,
      model115Periodicity:
        snap.model115Periodicity ??
        (snap.settings as { model115Periodicity?: string } | null)
          ?.model115Periodicity,
      hasLeaseWithholdingUnknown: snap.hasLeaseWithholdingUnknown,
      filed: Boolean(f115),
      filingId: f115?.id ?? null,
      now,
    });
    obligations.push(a115.entry);
    if (a115.mismatch) mismatches.push(a115.mismatch);
  }

  // Anuales (siempre en el mapa del año; en modo quarter también se listan como contexto)
  const f390 = findFiling(snap.filings, "390", year, null);
  const a390 = adapt390Obligation({
    profile,
    year,
    filed: Boolean(f390),
    filingId: f390?.id ?? null,
    now,
    precomputedStatus: snap.model390Status,
    precomputedReasons: snap.model390Reasons,
  });
  obligations.push(a390.entry);
  if (a390.mismatch) mismatches.push(a390.mismatch);

  const f347 = findFiling(snap.filings, "347", year, null);
  const a347 = adapt347Obligation({
    profile,
    year,
    hasDeclarableOps: snap.model347HasDeclarableOps ?? null,
    filed: Boolean(f347),
    filingId: f347?.id ?? null,
    now,
  });
  obligations.push(a347.entry);

  const f180 = findFiling(snap.filings, "180", year, null);
  const a180 = adapt180Obligation({
    profile,
    year,
    hasRelevantRentPayments:
      snap.hasPracticedRentWithholding == null
        ? null
        : Boolean(snap.hasPracticedRentWithholding),
    hasActiveLeaseWithoutRent:
      Boolean(snap.hasActiveBusinessPremisesLease) &&
      !snap.hasPracticedRentWithholding,
    filed: Boolean(f180),
    filingId: f180?.id ?? null,
    now,
  });
  obligations.push(a180.entry);
  if (a180.mismatch) mismatches.push(a180.mismatch);

  const f190 = findFiling(snap.filings, "190", year, null);
  const a190 = adapt190Obligation({
    profile,
    year,
    hasRelevantPerceptions:
      snap.hasPracticedProfessionalWithholding == null
        ? null
        : Boolean(snap.hasPracticedProfessionalWithholding),
    hasEmployees: profile.facts.hasEmployees,
    filed: Boolean(f190),
    filingId: f190?.id ?? null,
    now,
  });
  obligations.push(a190.entry);
  if (a190.mismatch) mismatches.push(a190.mismatch);

  const profileCompleteness = assessCensusProfileCompleteness(profile);
  if (profileCompleteness === "INSUFFICIENT") {
    warnings.push("Perfil censal insuficiente para determinar varias obligaciones.");
  } else if (profileCompleteness === "PARTIAL") {
    warnings.push("Perfil censal incompleto: algunas obligaciones quedan en UNKNOWN.");
  }

  // Deduplicate mismatches by code+model
  const seen = new Set<string>();
  const uniqueMismatches = mismatches.filter((m) => {
    const k = `${m.code}|${m.model}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return {
    obligations,
    profile,
    profileCompleteness,
    mismatches: uniqueMismatches,
    warnings,
    generatedAt: now,
    year,
    quarter,
    mode,
  };
}
