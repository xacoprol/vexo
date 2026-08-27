import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assess130FilingObligation } from "../modelo-130/filing-obligation";
import {
  buildFiscalObligationsFromSnapshot,
  compareCensusVsOperationalSignals,
  resolveFilingStatus,
  type CensusSettingsRow,
} from "../fiscal-obligations";
import { evaluateFilingGateFromHealth } from "../fiscal-health/engine";
import { resolveHealthStatus } from "../fiscal-health/issue";

function baseSettings(
  overrides: Partial<CensusSettingsRow> = {}
): CensusSettingsRow {
  return {
    fiscalRegime: "130",
    irpfDirectEstimationMode: "SIMPLIFIED",
    activityKind130: "BUSINESS",
    priorYearWithholdingPct130: 20,
    activityStartYear: 2020,
    vatPeriodicity: "QUARTERLY",
    vatUsesSii: "NO",
    vatTerritory: "COMMON_ONLY",
    vatActivity390Scope: "GENERAL",
    lastVatPeriodFilingRequired: "YES",
    paysProfessionalsSubjectToWithholding: "UNKNOWN",
    hasEmployees: "NO",
    rentsBusinessPremises: "NO",
    businessRentSubjectToWithholding: "NO",
    censusModel130: "YES",
    censusModel303: "YES",
    censusModel111: "UNKNOWN",
    censusModel115: "UNKNOWN",
    censusModel180: "UNKNOWN",
    censusModel190: "UNKNOWN",
    censusModel349: "UNKNOWN",
    censusModel347: "UNKNOWN",
    censusModel390: "UNKNOWN",
    censusSource: "MANUAL",
    censusLastUpdatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

describe("Fase 9.2 — perfil censal + mapa obligaciones", () => {
  describe("Census vs operaciones", () => {
    it("census111=NO + withholding profesional → mismatch", () => {
      const profile = buildFiscalObligationsFromSnapshot({
        year: 2026,
        quarter: 2,
        settings: baseSettings({ censusModel111: "NO" }),
        filings: [],
        hasPracticedProfessionalWithholding: true,
      }).profile;
      const m = compareCensusVsOperationalSignals(profile, {
        hasPracticedProfessionalWithholding: true,
      });
      assert.ok(m.some((x) => x.code === "CENSUS_MODEL111_MISMATCH"));
    });

    it("census111=UNKNOWN + withholding → review", () => {
      const profile = buildFiscalObligationsFromSnapshot({
        year: 2026,
        quarter: 2,
        settings: baseSettings({ censusModel111: "UNKNOWN" }),
        filings: [],
        hasPracticedProfessionalWithholding: true,
      }).profile;
      const m = compareCensusVsOperationalSignals(profile, {
        hasPracticedProfessionalWithholding: true,
      });
      assert.ok(
        m.some((x) => x.code === "MODEL111_OBLIGATION_REVIEW_REQUIRED")
      );
    });

    it("census111=YES + zero ops → NO convertir a NOT_REQUIRED", () => {
      const r = buildFiscalObligationsFromSnapshot({
        year: 2026,
        quarter: 2,
        settings: baseSettings({ censusModel111: "YES" }),
        filings: [],
        hasPracticedProfessionalWithholding: false,
        model111HasOps: { 2: false },
      });
      const e111 = r.obligations.find(
        (o) => o.model === "111" && o.period.quarter === 2
      );
      assert.ok(e111);
      assert.equal(e111!.operationsSignal, "ZERO_OPS");
      assert.notEqual(e111!.obligationStatus, "NOT_REQUIRED");
      assert.ok(e111!.reasonCodes.includes("ZERO_OPS_NOT_EXEMPT"));
    });
  });

  describe("349 zero ops", () => {
    it("operationsSignal ZERO_OPS y obligación independiente", () => {
      const r = buildFiscalObligationsFromSnapshot({
        year: 2026,
        quarter: 2,
        settings: baseSettings({ censusModel349: "YES" }),
        filings: [],
        model349HasOps: { 2: false },
      });
      const e = r.obligations.find(
        (o) => o.model === "349" && o.period.quarter === 2
      );
      assert.ok(e);
      assert.equal(e!.operationsSignal, "ZERO_OPS");
      assert.equal(e!.obligationStatus, "REQUIRED");
      assert.notEqual(e!.obligationStatus, "NOT_APPLICABLE");
    });

    it("census UNKNOWN + zero ops → UNKNOWN (no NOT_APPLICABLE)", () => {
      const r = buildFiscalObligationsFromSnapshot({
        year: 2026,
        quarter: 1,
        settings: baseSettings({ censusModel349: "UNKNOWN" }),
        filings: [],
        model349HasOps: { 1: false },
      });
      const e = r.obligations.find(
        (o) => o.model === "349" && o.period.quarter === 1
      );
      assert.equal(e!.operationsSignal, "ZERO_OPS");
      assert.equal(e!.obligationStatus, "UNKNOWN");
    });
  });

  describe("130", () => {
    it("resolver REQUIRED + census YES → consistente", () => {
      const resolved = assess130FilingObligation({
        fiscalRegime: "130",
        incomeBaseYtd: 10000,
        incomeWithWithholdingYtd: 0,
        isProfessionalActivity: false,
        priorYearWithholdingPct: 20,
        activityStartYear: 2020,
        currentYear: 2026,
      });
      assert.equal(resolved.status, "REQUIRED");

      const r = buildFiscalObligationsFromSnapshot({
        year: 2026,
        quarter: 2,
        settings: baseSettings({
          censusModel130: "YES",
          activityKind130: "BUSINESS",
          priorYearWithholdingPct130: 20,
        }),
        filings: [],
        incomeBaseYtd: 10000,
      });
      const e = r.obligations.find(
        (o) => o.model === "130" && o.period.quarter === 2
      );
      assert.equal(e!.obligationStatus, "REQUIRED");
      assert.equal(e!.censusSignal, "YES");
      assert.ok(!r.mismatches.some((m) => m.model === "130"));
    });

    it("resolver NOT_REQUIRED + census YES → review", () => {
      const r = buildFiscalObligationsFromSnapshot({
        year: 2026,
        quarter: 2,
        settings: baseSettings({
          censusModel130: "YES",
          activityKind130: "PROFESSIONAL",
          priorYearWithholdingPct130: 85,
        }),
        filings: [],
        incomeBaseYtd: 10000,
        incomeWithWithholdingYtd: 9000,
      });
      const e = r.obligations.find(
        (o) => o.model === "130" && o.period.quarter === 2
      );
      assert.equal(e!.obligationStatus, "NOT_REQUIRED");
      assert.ok(
        r.mismatches.some(
          (m) =>
            m.model === "130" &&
            m.code === "CENSUS_MODEL130_REVIEW_REQUIRED"
        )
      );
    });
  });

  describe("390", () => {
    it("EXEMPT → NOT_REQUIRED y no pendiente de presentar", () => {
      const r = buildFiscalObligationsFromSnapshot({
        year: 2026,
        settings: baseSettings(),
        filings: [],
        model390Status: "EXEMPT",
        model390Reasons: ["Exonerado SII"],
      });
      const e = r.obligations.find((o) => o.model === "390");
      assert.equal(e!.obligationStatus, "NOT_REQUIRED");
      assert.equal(e!.filingStatus, "NOT_APPLICABLE");
      assert.ok(e!.reasonCodes.includes("390_EXEMPT"));
    });
  });

  describe("Filing", () => {
    it("REQUIRED + filing existe → FILED", () => {
      const r = buildFiscalObligationsFromSnapshot({
        year: 2026,
        quarter: 2,
        settings: baseSettings({ vatPeriodicity: "QUARTERLY", censusModel303: "YES" }),
        filings: [
          { id: "f303", modelType: "303", year: 2026, quarter: 2 },
        ],
      });
      const e = r.obligations.find(
        (o) => o.model === "303" && o.period.quarter === 2
      );
      assert.equal(e!.obligationStatus, "REQUIRED");
      assert.equal(e!.filingStatus, "FILED");
      assert.equal(e!.filingId, "f303");
    });

    it("111 deadline fiable (weekend adjust) — puede OVERDUE si REQUIRED", () => {
      const status = resolveFilingStatus({
        obligationStatus: "REQUIRED",
        filed: false,
        filingId: null,
        dueDate: null,
        dueDateReliable: false,
        now: new Date("2027-12-31"),
      });
      assert.equal(status, "REQUIRES_REVIEW");
      assert.notEqual(status, "OVERDUE");

      const r = buildFiscalObligationsFromSnapshot({
        year: 2026,
        quarter: 2,
        settings: baseSettings({ censusModel111: "YES" }),
        filings: [],
        model111HasOps: { 2: true },
        hasPracticedProfessionalWithholding: true,
        now: new Date("2026-05-01"),
      });
      const e111 = r.obligations.find(
        (o) => o.model === "111" && o.period.quarter === 2
      );
      assert.equal(e111!.dueDateReliable, true);
      assert.ok(e111!.dueDate);
      assert.equal(e111!.filingStatus, "UPCOMING");
    });
  });

  describe("Gate aislamiento", () => {
    it("issue 115 no bloquea filing 303", () => {
      const blocker115 = {
        code: "OBLIGATION_UNKNOWN",
        fingerprint: "a",
        severity: "ERROR" as const,
        blocksFiling: true,
        title: "115",
        description: "",
        model: "115" as const,
        year: 2026,
        quarter: 2 as const,
      };
      const { status } = resolveHealthStatus([blocker115]);
      const gate = evaluateFilingGateFromHealth(
        { status, blockers: [blocker115], issues: [blocker115] },
        "303"
      );
      assert.equal(gate.allowed, true);
    });

    it("issue 303 bloqueante sí bloquea 303", () => {
      const blocker = {
        code: "MODEL303_CHAIN_CARRY_BREAK",
        fingerprint: "x",
        severity: "ERROR" as const,
        blocksFiling: true,
        title: "Cadena rota",
        description: "",
        model: "303" as const,
        year: 2026,
        quarter: 2 as const,
      };
      const { status } = resolveHealthStatus([blocker]);
      const gate = evaluateFilingGateFromHealth(
        { status, blockers: [blocker], issues: [blocker] },
        "303"
      );
      assert.equal(gate.allowed, false);
    });
  });

  describe("Anuales preparados", () => {
    it("incluye 180/190 UNKNOWN", () => {
      const r = buildFiscalObligationsFromSnapshot({
        year: 2026,
        settings: baseSettings(),
        filings: [],
      });
      assert.ok(r.obligations.some((o) => o.model === "180"));
      assert.ok(r.obligations.some((o) => o.model === "190"));
      assert.equal(
        r.obligations.find((o) => o.model === "180")!.obligationStatus,
        "UNKNOWN"
      );
    });
  });
});
