/**
 * Modelo 111 — scope Fase 9.4.
 *
 * Soportado: retenciones PRACTICED kind=PROFESSIONAL (actividades económicas dinerarias).
 * No soportado: trabajo, especie, premios, agrario/ganadero/forestal, imagen, 190.
 */

import type { FiscalQuarter } from "@/lib/fiscal";

export const MODEL111_SCOPE_NOTE =
  "Modelo 111 · scope VEXO Fase 9.4: únicamente retenciones practicadas sobre " +
  "rendimientos de actividades económicas/profesionales (FiscalWithholding " +
  "PRACTICED / PROFESSIONAL). No calcula trabajo, especie, premios ni 190.";

export const MODEL111_PERIODICITY = {
  QUARTERLY: "QUARTERLY",
  MONTHLY: "MONTHLY",
  UNKNOWN: "UNKNOWN",
} as const;
export type Model111Periodicity =
  (typeof MODEL111_PERIODICITY)[keyof typeof MODEL111_PERIODICITY];

export type Model111Outcome =
  | "TO_PAY"
  | "NEGATIVE"
  | "NO_RELEVANT_PAYMENTS"
  | "REQUIRES_REVIEW";

export type Model111SupportedSections = {
  economicActivitiesCash: true;
  employment: false;
  economicActivitiesInKind: false;
  prizes: false;
  agricultural: false;
  imageRights: false;
  complementary: false;
};

export const MODEL111_SUPPORTED_SECTIONS: Model111SupportedSections = {
  economicActivitiesCash: true,
  employment: false,
  economicActivitiesInKind: false,
  prizes: false,
  agricultural: false,
  imageRights: false,
  complementary: false,
};

export type Model111Boxes = {
  box01: number;
  box02: number;
  box03: number;
  box04: number;
  box05: number;
  box06: number;
  box07: number;
  box08: number;
  box09: number;
  box10: number;
  box11: number;
  box12: number;
  box13: number;
  box14: number;
  box15: number;
  box16: number;
  box17: number;
  box18: number;
  box19: number;
  box20: number;
  box21: number;
  box22: number;
  box23: number;
  box24: number;
  box25: number;
  box26: number;
  box27: number;
  box28: number;
  box29: number;
  box30: number;
};

export type Model111TraceLine = {
  withholdingId: string;
  counterpartyId: string;
  sourceType: string;
  sourceId: string;
  professionalName: string;
  taxId: string;
  paymentDate: string;
  accrualDate: string | null;
  baseAmount: number;
  withholdingAmount: number;
  rate: number;
  href: string | null;
};

export type Model111Warning = {
  code: string;
  message: string;
  withholdingId?: string;
  sourceId?: string;
  severity?: "ERROR" | "WARNING" | "INFO";
};

export type Model111WithholdingRow = {
  id: string;
  direction: string;
  kind: string;
  status: string;
  rectifiesId: string | null;
  counterpartyId: string;
  sourceType: string;
  sourceId: string;
  baseAmount: number;
  rate: number;
  withholdingAmount: number;
  accrualDate: Date;
  paymentDate: Date | null;
  year: number;
  quarter: number;
  counterparty: {
    id: string;
    name: string;
    taxId: string;
    normalizedTaxId: string;
    kind: string;
    countryCode: string;
    requiresReview: boolean;
  };
};

export type Model111PeriodResolution =
  | {
      ok: true;
      year: number;
      quarter: FiscalQuarter;
      month: number | null;
      basis: "paymentDate";
      paymentDate: Date;
    }
  | {
      ok: false;
      code: "MODEL111_PAYMENT_DATE_MISSING";
      message: string;
      accrualDate: Date | null;
      requiresReview: true;
    };

export type Model111Deadline = {
  dueDate: Date;
  dueLabel: string;
  periodicity: Model111Periodicity;
  periodLabel: string;
  scopeNote: string;
  requiresOfficialCalendarCheck: true;
};

export type Model111FilingObligation = {
  status: "REQUIRED" | "NOT_REQUIRED" | "NOT_APPLICABLE" | "UNKNOWN";
  reasons: string[];
  reasonCodes: string[];
  operationsSignal: "HAS_OPS" | "ZERO_OPS" | "UNKNOWN";
  censusSignal: "YES" | "NO" | "UNKNOWN";
  outcomeHint: Model111Outcome | null;
};

export type Model111Result = {
  year: number;
  quarter: FiscalQuarter;
  month: number | null;
  periodicity: Model111Periodicity;
  label: string;
  scopeNote: string;
  supportedSections: Model111SupportedSections;
  boxes: Model111Boxes;
  boxList: { code: string; label: string; value: number; supported: boolean }[];
  payees: {
    counterpartyId: string;
    name: string;
    taxId: string;
    baseAmount: number;
    withholdingAmount: number;
    lines: Model111TraceLine[];
  }[];
  trace: {
    box07: Model111TraceLine[];
    box08: Model111TraceLine[];
    box09: Model111TraceLine[];
  };
  warnings: Model111Warning[];
  requiresReview: boolean;
  outcome: Model111Outcome;
  filingObligation: Model111FilingObligation;
  deadline: Model111Deadline;
  excludedMissingPaymentDate: Model111WithholdingRow[];
};

export type Model111PresentedSnapshot = {
  version: 1;
  year: number;
  quarter: FiscalQuarter;
  boxes: Model111Boxes;
  payees: {
    counterpartyId: string;
    name: string;
    taxId: string;
    baseAmount: number;
    withholdingAmount: number;
  }[];
  outcome: Model111Outcome;
  presentedAt?: string;
};
