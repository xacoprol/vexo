"use server";

import { canFileFiscalModel } from "@/lib/fiscal-health";
import type { FiscalModelType } from "@/lib/gemini-fiscal-filing";

export async function checkFiscalFilingGate(input: {
  modelType: FiscalModelType;
  year: number;
  quarter: number | null;
}) {
  return canFileFiscalModel(input);
}
