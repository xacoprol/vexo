/**
 * Adapter de calendario sobre resolvers existentes.
 */

import type { FiscalQuarter } from "@/lib/fiscal";
import { resolve111Deadline } from "@/lib/modelo-111/deadlines";
import { resolve115Deadline } from "@/lib/modelo-115/deadlines";
import { resolve180Deadline } from "@/lib/modelo-180/deadlines";
import { resolve190Deadline } from "@/lib/modelo-190/deadlines";
import { resolve347Deadline } from "@/lib/modelo-347/deadlines";
import { resolve349Deadline } from "@/lib/modelo-349/deadlines";
import type {
  FilingStatus,
  ObligationModelCode,
  ObligationStatus,
} from "@/lib/fiscal-obligations/types";

function dueDayForQuarter(year: number, quarter: FiscalQuarter): Date {
  const monthAfter = quarter === 4 ? 0 : quarter * 3;
  const y = quarter === 4 ? year + 1 : year;
  return new Date(y, monthAfter, 20, 23, 59, 59);
}

export type DueDateResolution = {
  dueDate: Date | null;
  /** Solo true para calendarios conocidos (130/303/349/390/347/111/115/180/190). */
  reliable: boolean;
};

export function resolveObligationDueDate(opts: {
  model: ObligationModelCode;
  year: number;
  quarter?: FiscalQuarter | null;
}): DueDateResolution {
  const { model, year, quarter } = opts;

  switch (model) {
    case "130":
    case "303":
      if (quarter == null) return { dueDate: null, reliable: false };
      return { dueDate: dueDayForQuarter(year, quarter), reliable: true };
    case "349": {
      if (quarter == null) return { dueDate: null, reliable: false };
      const d = resolve349Deadline({
        kind: "QUARTERLY",
        year,
        quarter,
        startMonth: (quarter - 1) * 3 + 1,
        endMonth: quarter * 3,
      });
      return { dueDate: d.dueDate, reliable: true };
    }
    case "390":
      return {
        dueDate: new Date(year + 1, 0, 30, 23, 59, 59),
        reliable: true,
      };
    case "347": {
      const d = resolve347Deadline(year);
      return { dueDate: d.dueDate, reliable: true };
    }
    case "111": {
      if (quarter == null) return { dueDate: null, reliable: false };
      const d = resolve111Deadline({
        year,
        quarter,
        periodicity: "QUARTERLY",
      });
      return { dueDate: d.dueDate, reliable: true };
    }
    case "115": {
      if (quarter == null) return { dueDate: null, reliable: false };
      const d = resolve115Deadline({
        year,
        quarter,
        periodicity: "QUARTERLY",
      });
      return { dueDate: d.dueDate, reliable: true };
    }
    case "180": {
      const d = resolve180Deadline(year);
      return { dueDate: d.dueDate, reliable: true };
    }
    case "190": {
      const d = resolve190Deadline(year);
      return { dueDate: d.dueDate, reliable: true };
    }
    default:
      return { dueDate: null, reliable: false };
  }
}

/**
 * Nunca OVERDUE si dueDate no es fiable.
 */
export function resolveFilingStatus(opts: {
  obligationStatus: ObligationStatus;
  filed: boolean;
  filingId: string | null;
  dueDate: Date | null;
  dueDateReliable: boolean;
  now: Date;
}): FilingStatus {
  const {
    obligationStatus,
    filed,
    dueDate,
    dueDateReliable,
    now,
  } = opts;

  if (
    obligationStatus === "NOT_REQUIRED" ||
    obligationStatus === "NOT_APPLICABLE"
  ) {
    return filed ? "FILED" : "NOT_APPLICABLE";
  }

  if (filed) return "FILED";

  if (obligationStatus === "UNKNOWN") {
    return "REQUIRES_REVIEW";
  }

  // REQUIRED
  if (!dueDateReliable || !dueDate) {
    return "REQUIRES_REVIEW";
  }

  const msLeft = dueDate.getTime() - now.getTime();
  const daysLeft = msLeft / (1000 * 60 * 60 * 24);

  if (msLeft < 0) return "OVERDUE";
  if (daysLeft <= 30) return "DUE";
  return "UPCOMING";
}
