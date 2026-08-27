/**
 * Fase 13 — inventario UNKNOWN + Health + close 2T 2026 (read-only).
 */
import { prisma } from "../lib/prisma";
import { buildFiscalObligations } from "../lib/fiscal-obligations";
import { buildFiscalHealthCheck } from "../lib/fiscal-health";
import { buildFiscalPeriodValidation } from "../lib/fiscal-validation";
import { buildFiscalCensusSuggestions } from "../lib/fiscal-census-suggestions";

async function main() {
  const year = 2026;
  const quarter = 2 as const;

  const settings = await prisma.companySettings.findFirst();
  console.log("NIF", settings?.nif);

  const censusFields = [
    "fiscalRegime",
    "activityKind130",
    "priorYearWithholdingPct130",
    "activityStartYear",
    "vatPeriodicity",
    "vatUsesSii",
    "vatTerritory",
    "vatActivity390Scope",
    "lastVatPeriodFilingRequired",
    "paysProfessionalsSubjectToWithholding",
    "hasEmployees",
    "rentsBusinessPremises",
    "businessRentSubjectToWithholding",
    "censusModel130",
    "censusModel303",
    "censusModel111",
    "censusModel115",
    "censusModel180",
    "censusModel190",
    "censusModel349",
    "censusModel347",
    "censusModel390",
    "model111Periodicity",
    "model115Periodicity",
    "previousYearNetIncome130Mode",
  ] as const;

  console.log("\n=== CENSUS FIELDS ===");
  for (const f of censusFields) {
    const v = (settings as Record<string, unknown> | null)?.[f];
    const unknown =
      v == null ||
      v === "" ||
      String(v).toUpperCase() === "UNKNOWN";
    if (unknown) {
      console.log(`${f}\t${v ?? "null"}\tUNKNOWN`);
    } else {
      console.log(`${f}\t${String(v)}`);
    }
  }

  const [obs, health, close, suggestions] = await Promise.all([
    buildFiscalObligations({ year, quarter }),
    buildFiscalHealthCheck({ year, quarter }),
    buildFiscalPeriodValidation({ year, quarter }),
    buildFiscalCensusSuggestions(prisma, settings),
  ]);

  console.log("\n=== OBLIGATIONS Q2 ===");
  for (const o of obs.obligations.filter((x) => x.period.quarter === quarter)) {
    console.log(
      o.model,
      o.obligationStatus,
      o.operationsSignal,
      o.filingStatus,
      o.reasonCodes?.join(",")
    );
  }

  console.log("\n=== HEALTH ===");
  console.log({
    status: health.status,
    critical: health.issues.filter((i) => i.severity === "CRITICAL").length,
    error: health.issues.filter((i) => i.severity === "ERROR").length,
    warning: health.issues.filter((i) => i.severity === "WARNING").length,
    blockers: health.blockers.map((b) => `${b.code}:${b.model}`),
  });

  const byCode = new Map<string, { count: number; severity: string }>();
  for (const i of health.issues) {
    const cur = byCode.get(i.code) ?? { count: 0, severity: i.severity };
    cur.count += 1;
    byCode.set(i.code, cur);
  }
  console.log("\n=== HEALTH BY CODE ===");
  for (const [code, v] of [...byCode.entries()].sort(
    (a, b) => b[1].count - a[1].count
  )) {
    console.log(`${code}\t${v.count}\t${v.severity}`);
  }

  console.log("\n=== CLOSE ===");
  console.log({
    readiness: close.readiness.status,
    lifecycle: close.lifecycle.status,
    readyToFile: close.lifecycle.readyToFile,
    unknownModels: close.lifecycle.unknownModels,
  });

  console.log("\n=== SUGGESTIONS ===");
  for (const s of suggestions) {
    console.log(s.field, "→", s.suggestedValue, `(${s.confidence})`, s.reason);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
