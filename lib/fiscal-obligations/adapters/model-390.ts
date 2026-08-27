import { assess390FilingObligation } from "@/lib/modelo-390/obligation";
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

/**
 * 390: reutiliza assess390FilingObligation.
 * EXEMPT → NOT_REQUIRED (naming del mapa maestro) + filingStatus NOT_APPLICABLE.
 */
export function adapt390Obligation(opts: {
  profile: FiscalCensusProfile;
  year: number;
  filed: boolean;
  filingId: string | null;
  now: Date;
  precomputedStatus?: "REQUIRED" | "EXEMPT" | "UNKNOWN";
  precomputedReasons?: string[];
}): { entry: FiscalObligationEntry; mismatch: CensusMismatch | null } {
  const census = opts.profile.obligations.model390;
  const facts = opts.profile.facts;

  const resolved =
    opts.precomputedStatus != null
      ? {
          status: opts.precomputedStatus,
          reasons: opts.precomputedReasons ?? [],
        }
      : assess390FilingObligation({
          vatPeriodicity: facts.vatPeriodicity,
          vatUsesSii: facts.vatUsesSii,
          vatTerritory: facts.vatTerritory,
          vatActivity390Scope: facts.vatActivity390Scope,
          lastVatPeriodFilingRequired: facts.lastVatPeriodFilingRequired,
        });

  let obligationStatus: ObligationStatus;
  if (resolved.status === "EXEMPT") {
    obligationStatus = "NOT_REQUIRED";
  } else if (resolved.status === "REQUIRED") {
    obligationStatus = "REQUIRED";
  } else {
    obligationStatus = "UNKNOWN";
  }

  if (census === "NO" && obligationStatus === "UNKNOWN") {
    obligationStatus = "NOT_APPLICABLE";
  }

  const due = resolveObligationDueDate({
    model: "390",
    year: opts.year,
    quarter: null,
  });
  const filingStatus = resolveFilingStatus({
    obligationStatus,
    filed: opts.filed,
    filingId: opts.filingId,
    dueDate: due.dueDate,
    dueDateReliable: due.reliable,
    now: opts.now,
  });

  const mismatch = compareResolverVsCensus({
    model: "390",
    resolverStatus: resolved.status,
    censusSignal: census,
  });

  return {
    entry: {
      model: "390",
      domain: "AEAT",
      period: {
        year: opts.year,
        quarter: null,
        label: `Año ${opts.year}`,
      },
      obligationStatus,
      reason:
        resolved.reasons[0] ??
        (resolved.status === "EXEMPT"
          ? "Exonerado de presentar Modelo 390."
          : "Obligación 390"),
      reasonCodes: [`390_${resolved.status}`],
      statusSource: "RESOLVER",
      censusSignal: census,
      operationsSignal: "UNKNOWN",
      filingStatus,
      dueDate: due.dueDate,
      dueDateReliable: due.reliable,
      filingId: opts.filingId,
      warnings: mismatch ? [mismatch.description] : [],
    },
    mismatch,
  };
}
