export type PreviousYearNetIncome130Mode = "UNKNOWN" | "NO_ACTIVITY" | "KNOWN";

export type Irpf130HousingDeduction = "NO" | "UNKNOWN" | "ELIGIBLE_CONFIRMED";

export type AgriculturalActivities130 = "NONE" | "UNKNOWN" | "HAS";

export type IrregularIncome130Status = "NONE" | "REVIEW_REQUIRED";

export function parsePreviousYearNetIncome130Mode(
  raw: unknown
): PreviousYearNetIncome130Mode {
  const v = String(raw ?? "UNKNOWN").toUpperCase().trim();
  if (v === "NO_ACTIVITY" || v === "NO-ACTIVITY" || v === "SIN_ACTIVIDAD") {
    return "NO_ACTIVITY";
  }
  if (v === "KNOWN" || v === "CONOCIDO") return "KNOWN";
  return "UNKNOWN";
}

export function parseIrpf130HousingDeduction(
  raw: unknown
): Irpf130HousingDeduction {
  const v = String(raw ?? "NO").toUpperCase().trim();
  if (
    v === "ELIGIBLE_CONFIRMED" ||
    v === "ELIGIBLE-CONFIRMED" ||
    v === "CONFIRMED" ||
    v === "YES" ||
    v === "SI" ||
    v === "SÍ"
  ) {
    return "ELIGIBLE_CONFIRMED";
  }
  if (v === "UNKNOWN" || v === "DESCONOCIDO") return "UNKNOWN";
  return "NO";
}

export function parseAgriculturalActivities130(
  raw: unknown
): AgriculturalActivities130 {
  const v = String(raw ?? "NONE").toUpperCase().trim();
  if (v === "HAS" || v === "SI" || v === "YES") return "HAS";
  if (v === "UNKNOWN") return "UNKNOWN";
  return "NONE";
}

export function parseIrregularIncome130Status(
  raw: unknown
): IrregularIncome130Status {
  return String(raw ?? "NONE").toUpperCase().trim() === "REVIEW_REQUIRED"
    ? "REVIEW_REQUIRED"
    : "NONE";
}
