import type {
  LeaseActivityUse,
  LeaseExemptionReason,
  LeaseWithholdingStatus,
} from "@/lib/fiscal-leases/types";
import {
  LEASE_EXEMPTION_REASON,
  LEASE_WITHHOLDING_STATUS,
} from "@/lib/fiscal-leases/types";

export type LeaseWithholdingCompletenessInput = {
  withholdingStatus: LeaseWithholdingStatus | string;
  withholdingExemptionReason?: string | null;
  landlordTaxId?: string | null;
  landlordName?: string | null;
  propertyAddress?: string | null;
  defaultWithholdingRate?: number | null;
  activityUse?: LeaseActivityUse | string | null;
};

export type LeaseCompletenessIssue = {
  code: string;
  message: string;
};

/**
 * Completitud de datos para retención de alquiler.
 * NO evalúa la obligación legal de retener (eso sería assessLegalLeaseWithholdingObligation).
 */
export function assessLeaseWithholdingDataCompleteness(
  input: LeaseWithholdingCompletenessInput
): {
  complete: boolean;
  issues: LeaseCompletenessIssue[];
} {
  const issues: LeaseCompletenessIssue[] = [];
  const status = String(input.withholdingStatus ?? "UNKNOWN").toUpperCase();

  if (!String(input.landlordName ?? "").trim()) {
    issues.push({
      code: "LEASE_WITHOUT_LANDLORD",
      message: "Falta el nombre del arrendador.",
    });
  }

  if (!String(input.landlordTaxId ?? "").trim()) {
    issues.push({
      code: "LEASE_LANDLORD_TAX_ID_MISSING",
      message: "Falta el NIF del arrendador (requiresReview).",
    });
  }

  if (!String(input.propertyAddress ?? "").trim()) {
    issues.push({
      code: "LEASE_PROPERTY_ADDRESS_MISSING",
      message: "Falta la dirección del inmueble.",
    });
  }

  if (status === LEASE_WITHHOLDING_STATUS.UNKNOWN) {
    issues.push({
      code: "LEASE_WITHHOLDING_UNKNOWN",
      message: "No está confirmado si el alquiler está sujeto a retención.",
    });
  }

  if (status === LEASE_WITHHOLDING_STATUS.NO) {
    const reason = String(input.withholdingExemptionReason ?? "").trim();
    if (
      !reason ||
      reason === LEASE_EXEMPTION_REASON.UNKNOWN
    ) {
      issues.push({
        code: "LEASE_EXEMPTION_REASON_MISSING",
        message:
          "Indicaste que no hay retención pero falta el motivo (dato revisable).",
      });
    }
  }

  if (status === LEASE_WITHHOLDING_STATUS.YES) {
    const rate = input.defaultWithholdingRate;
    if (rate == null || !Number.isFinite(Number(rate)) || Number(rate) < 0) {
      issues.push({
        code: "LEASE_DEFAULT_RATE_MISSING",
        message: "Sujeto a retención: conviene indicar el tipo % habitual.",
      });
    }
  }

  return { complete: issues.length === 0, issues };
}

export function isValidExemptionReason(
  raw: string | null | undefined
): raw is LeaseExemptionReason {
  if (!raw) return false;
  return raw in LEASE_EXEMPTION_REASON;
}
