import type { FiscalQuarter } from "@/lib/fiscal";
import { assess130FilingObligation } from "@/lib/modelo-130/filing-obligation";
import { resolveCensusNoAgainstBooks } from "@/lib/fiscal-obligations/census-contradiction";
import { compareResolverVsCensus } from "@/lib/fiscal-obligations/compare-census";
import {
  resolveFilingStatus,
  resolveObligationDueDate,
} from "@/lib/fiscal-obligations/filing-status";
import type {
  CensusMismatch,
  FiscalCensusProfile,
  FiscalObligationEntry,
  ObligationStatus,
} from "@/lib/fiscal-obligations/types";

export function adapt130Obligation(opts: {
  profile: FiscalCensusProfile;
  year: number;
  quarter: FiscalQuarter;
  incomeBaseYtd: number;
  incomeWithWithholdingYtd: number;
  filed: boolean;
  filingId: string | null;
  now: Date;
}): { entry: FiscalObligationEntry; mismatch: CensusMismatch | null } {
  const census = opts.profile.obligations.model130;
  const kind = opts.profile.facts.activityKind130;
  const isProfessional =
    kind === "PROFESSIONAL" ? true : kind === "BUSINESS" ? false : null;

  const resolved = assess130FilingObligation({
    fiscalRegime: opts.profile.facts.fiscalRegime,
    incomeBaseYtd: opts.incomeBaseYtd,
    incomeWithWithholdingYtd: opts.incomeWithWithholdingYtd,
    isProfessionalActivity: isProfessional,
    priorYearWithholdingPct: opts.profile.facts.priorYearWithholdingPct130,
    activityStartYear: opts.profile.facts.activityStartYear,
    currentYear: opts.year,
  });

  const hasOps = opts.incomeBaseYtd > 0;
  const censusNo = resolveCensusNoAgainstBooks({
    model: "130",
    census,
    hasOps,
  });

  let obligationStatus: ObligationStatus = resolved.status;
  let statusSource: FiscalObligationEntry["statusSource"] = "RESOLVER";
  const reasonCodes: string[] = resolved.reasons.map(
    (_, i) => `130_REASON_${i}`
  );
  let reason = resolved.reasons[0] ?? "Obligación 130";
  let mismatch: CensusMismatch | null = null;

  if (censusNo?.contradicts) {
    obligationStatus = censusNo.obligationStatus;
    statusSource = censusNo.statusSource;
    reason = censusNo.reason;
    reasonCodes.push(...censusNo.reasonCodes);
    mismatch = {
      code: "CENSUS_CONTRADICTS_BOOKS",
      model: "130",
      severity: "CRITICAL",
      title: "Censo 130 contradice los libros",
      description: censusNo.reason,
    };
  } else if (census === "NO") {
    obligationStatus = "NOT_APPLICABLE";
    statusSource = "CENSUS";
    reason = "Perfil censal: Modelo 130 = NO.";
    reasonCodes.push("CENSUS_130_NO");
  } else if (resolved.status === "UNKNOWN") {
    statusSource = "INSUFFICIENT_DATA";
  }

  const due = resolveObligationDueDate({
    model: "130",
    year: opts.year,
    quarter: opts.quarter,
  });
  const filingStatus = resolveFilingStatus({
    obligationStatus,
    filed: opts.filed,
    filingId: opts.filingId,
    dueDate: due.dueDate,
    dueDateReliable: due.reliable,
    now: opts.now,
  });

  if (!mismatch) {
    mismatch = compareResolverVsCensus({
      model: "130",
      resolverStatus: obligationStatus,
      censusSignal: census,
    });
  }

  return {
    entry: {
      model: "130",
      domain: "AEAT",
      period: {
        year: opts.year,
        quarter: opts.quarter,
        label: `${opts.quarter}T ${opts.year}`,
      },
      obligationStatus,
      reason,
      reasonCodes,
      statusSource,
      censusSignal: census,
      operationsSignal: hasOps ? "HAS_OPS" : "ZERO_OPS",
      filingStatus,
      dueDate: due.dueDate,
      dueDateReliable: due.reliable,
      filingId: opts.filingId,
      warnings: mismatch ? [mismatch.description] : [],
    },
    mismatch,
  };
}
