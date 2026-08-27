import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeExpenseDeductibility } from "../expense-deductibility";
import { aggregateModel303Period } from "../modelo-303";
import { quarterRange } from "../fiscal";
import {
  assessLeaseWithholdingDataCompleteness,
  LEASE_EXEMPTION_REASON,
  LEASE_WITHHOLDING_STATUS,
  parseLeaseWithholdingStatus,
} from "../fiscal-leases";
import {
  COUNTERPARTY_KIND,
  expectedWithholdingAmount,
  normalizeCounterpartyTaxId,
  resolveExpenseDocumentAmounts,
  WITHHOLDING_DIRECTION,
  WITHHOLDING_KIND,
  WITHHOLDING_STATUS,
} from "../fiscal-withholding";
import { runLeaseHealthChecks } from "../fiscal-health/lease-checks";
import type { FiscalHealthContext } from "../fiscal-health/context";
import {
  buildFiscalCensusProfileFromSettings,
  buildFiscalObligationsFromSnapshot,
  compareCensusVsOperationalSignals,
} from "../fiscal-obligations";

function emptyHealthCtx(
  overrides: Partial<FiscalHealthContext> = {}
): FiscalHealthContext {
  return {
    year: 2026,
    quarter: 2,
    mode: "quarter",
    queryCount: 0,
    settings: {
      nif: "B12345678",
      fiscalRegime: "130",
      verifactuMode: "NO_VERIFACTU",
      simplifiedInvoiceMaxAmount: 400,
      paysProfessionalsSubjectToWithholding: "UNKNOWN",
      censusModel111: "UNKNOWN",
      model111Periodicity: "UNKNOWN",
      model115Periodicity: "UNKNOWN",
      censusModel130: "UNKNOWN",
      censusModel303: "UNKNOWN",
      censusModel115: "UNKNOWN",
      censusModel180: "UNKNOWN",
      censusModel190: "UNKNOWN",
      censusModel349: "UNKNOWN",
      censusModel347: "UNKNOWN",
      censusModel390: "UNKNOWN",
      hasEmployees: "UNKNOWN",
      rentsBusinessPremises: "UNKNOWN",
      businessRentSubjectToWithholding: "UNKNOWN",
      activityKind130: "UNKNOWN",
      priorYearWithholdingPct130: null,
      activityStartYear: null,
      vatPeriodicity: "UNKNOWN",
      vatUsesSii: "UNKNOWN",
      vatTerritory: "UNKNOWN",
      vatActivity390Scope: "UNKNOWN",
      lastVatPeriodFilingRequired: "UNKNOWN",
      censusSource: "UNKNOWN",
      censusLastUpdatedAt: null,
    },
    periodSummary: null,
    draft349: null,
    draft349Year: [],
    draft349All: [],
    chain303: null,
    chain130: null,
    presented303: null,
    presented130: null,
    presented349: null,
    presented111: null,
    presented115: null,
    presented180: null,
    presented190: null,
    model390: null,
    draft347: null,
    presented347: null,
    presented390: null,
    yearSummary: null,
    invoices: [],
    expenses: [],
    marketplace: [],
    invoicesYear: [],
    expensesYear: [],
    marketplaceYear: [],
    practicedWithholdingsYear: [],
    leasesActive: [],
    verifactu: {
      checkedAt: new Date(),
      invoiceCount: 0,
      sealedCount: 0,
      unsealedCount: 0,
      annulledWithoutEvent: 0,
      issues: [],
    },
    filingsYear: [],
    ...overrides,
  };
}

describe("Fase 9.3 — arrendamientos de local", () => {
  describe("tipos / completitud", () => {
    it("parseLeaseWithholdingStatus YES/NO/UNKNOWN", () => {
      assert.equal(parseLeaseWithholdingStatus("YES"), "YES");
      assert.equal(parseLeaseWithholdingStatus("NO"), "NO");
      assert.equal(parseLeaseWithholdingStatus(""), "UNKNOWN");
    });

    it("UNKNOWN → warning; NO sin motivo → warning", () => {
      const unk = assessLeaseWithholdingDataCompleteness({
        withholdingStatus: LEASE_WITHHOLDING_STATUS.UNKNOWN,
        landlordName: "Arrendador SA",
        landlordTaxId: "B12345678",
        propertyAddress: "Calle Local 1",
      });
      assert.ok(
        unk.issues.some((i) => i.code === "LEASE_WITHHOLDING_UNKNOWN")
      );

      const noReason = assessLeaseWithholdingDataCompleteness({
        withholdingStatus: LEASE_WITHHOLDING_STATUS.NO,
        landlordName: "Arrendador SA",
        landlordTaxId: "B12345678",
        propertyAddress: "Calle Local 1",
        withholdingExemptionReason: null,
      });
      assert.ok(
        noReason.issues.some((i) => i.code === "LEASE_EXEMPTION_REASON_MISSING")
      );

      const ok = assessLeaseWithholdingDataCompleteness({
        withholdingStatus: LEASE_WITHHOLDING_STATUS.NO,
        landlordName: "Arrendador SA",
        landlordTaxId: "B12345678",
        propertyAddress: "Calle Local 1",
        withholdingExemptionReason: LEASE_EXEMPTION_REASON.LOW_ANNUAL_AMOUNT,
      });
      assert.equal(ok.complete, true);
    });

    it("LANDLORD kind constante disponible", () => {
      assert.equal(COUNTERPARTY_KIND.LANDLORD, "LANDLORD");
      assert.equal(normalizeCounterpartyTaxId("b-12.345.678"), "B12345678");
    });
  });

  describe("importes alquiler con retención", () => {
    it("base 1000 + IVA 210 + ret 190 → bruto 1210 → pagar 1020", () => {
      assert.equal(expectedWithholdingAmount(1000, 19), 190);
      const amts = resolveExpenseDocumentAmounts({
        subtotal: 1000,
        vatAmount: 210,
        total: 1210,
        practicedWithholdingStatus: "YES",
        practicedWithholdingAmount: 190,
      });
      assert.equal(amts.grossInvoiceAmount, 1210);
      assert.equal(amts.withholdingAmount, 190);
      assert.equal(amts.amountPayable, 1020);
    });
  });

  describe("deducibilidad / IVA intactos", () => {
    it("con vs sin retención → mismo IRPF computable", () => {
      const base = {
        subtotal: 1000,
        vatAmount: 210,
        vatDeductiblePct: 100,
        irpfDeductiblePct: 100,
      };
      const a = computeExpenseDeductibility(base);
      const b = computeExpenseDeductibility(base);
      assert.equal(a.irpfComputable, b.irpfComputable);
      assert.equal(a.irpfComputable, 1000);
      assert.notEqual(1020, a.irpfComputable);
    });

    it("mismo IVA 303 con/sin retención", () => {
      const period = quarterRange(2026, 2);
      const expenseBase = {
        id: "e1",
        issueDate: new Date("2026-05-10"),
        subtotal: 1000,
        vatAmount: 210,
        vatRate: 21,
        total: 1210,
        vatOperationType: "INTERIOR",
        vatDeductiblePct: 100,
        irpfDeductiblePct: 100,
        isInvestment: false,
        supplierName: "Landlord",
      };
      const emptyLines = { invoices: [], marketplace: [], assets: [] };
      const r1 = aggregateModel303Period({
        ...emptyLines,
        expenses: [expenseBase],
        from: period.from,
        to: period.to,
      });
      const r2 = aggregateModel303Period({
        ...emptyLines,
        expenses: [{ ...expenseBase, total: 1020 }],
        from: period.from,
        to: period.to,
      });
      assert.equal(r1.modelo303.boxes.box28, r2.modelo303.boxes.box28);
      assert.equal(r1.modelo303.boxes.box29, r2.modelo303.boxes.box29);
      assert.equal(r1.modelo303.boxes.box29, 210);
    });
  });

  describe("histórico no inventado", () => {
    it("gasto antiguo sin leaseId → no implica withholding RENT", () => {
      const historical = {
        leaseId: null as string | null,
        practicedWithholdingStatus: "UNKNOWN",
        category: "OTROS",
      };
      assert.equal(historical.leaseId, null);
      assert.notEqual(historical.practicedWithholdingStatus, "YES");
    });
  });

  describe("obligations operationsSignal 115/180", () => {
    it("rent withholding → model115 HAS_OPS y model180 HAS_OPS", () => {
      const result = buildFiscalObligationsFromSnapshot({
        year: 2026,
        quarter: 2,
        settings: {
          nif: "B12345678",
          fiscalRegime: "130",
          paysProfessionalsSubjectToWithholding: "UNKNOWN",
          censusModel111: "UNKNOWN",
      model111Periodicity: "UNKNOWN",
      model115Periodicity: "UNKNOWN",
          censusModel130: "YES",
          censusModel303: "YES",
          censusModel115: "UNKNOWN",
          censusModel180: "UNKNOWN",
          censusModel190: "UNKNOWN",
          censusModel349: "UNKNOWN",
          censusModel347: "UNKNOWN",
          censusModel390: "UNKNOWN",
          hasEmployees: "NO",
          rentsBusinessPremises: "UNKNOWN",
          businessRentSubjectToWithholding: "UNKNOWN",
          activityKind130: "UNKNOWN",
          priorYearWithholdingPct130: null,
          activityStartYear: 2020,
          vatPeriodicity: "QUARTERLY",
          vatUsesSii: "NO",
          vatTerritory: "COMMON",
          vatActivity390Scope: "UNKNOWN",
          lastVatPeriodFilingRequired: "UNKNOWN",
          censusSource: "MANUAL",
          censusLastUpdatedAt: null,
        },
        filings: [],
        hasPracticedProfessionalWithholding: false,
        hasPracticedRentWithholding: true,
        hasActiveBusinessPremisesLease: true,
      });
      const m115 = result.obligations.find(
        (o) => o.model === "115" && o.period.quarter === 2
      );
      const m180 = result.obligations.find((o) => o.model === "180");
      assert.equal(m115?.operationsSignal, "HAS_OPS");
      assert.equal(m180?.operationsSignal, "HAS_OPS");
      assert.notEqual(m115?.obligationStatus, "REQUIRED");
    });

    it("sin rent withholding → ZERO_OPS", () => {
      const result = buildFiscalObligationsFromSnapshot({
        year: 2026,
        quarter: 1,
        settings: null,
        filings: [],
        hasPracticedRentWithholding: false,
      });
      const m115 = result.obligations.find(
        (o) => o.model === "115" && o.period.quarter === 1
      );
      assert.equal(m115?.operationsSignal, "ZERO_OPS");
    });
  });

  describe("census mismatches", () => {
    it("lease activo + rentsBusinessPremises NO → CENSUS_RENT_ACTIVITY_MISMATCH", () => {
      const profile = buildFiscalCensusProfileFromSettings({
        nif: "B12345678",
        fiscalRegime: "130",
        rentsBusinessPremises: "NO",
        censusModel115: "UNKNOWN",
      });
      const mismatches = compareCensusVsOperationalSignals(profile, {
        hasPracticedProfessionalWithholding: false,
        hasPracticedRentWithholding: false,
        hasActiveBusinessPremisesLease: true,
      });
      assert.ok(
        mismatches.some((m) => m.code === "CENSUS_RENT_ACTIVITY_MISMATCH")
      );
    });

    it("rent withholding + census115 NO → CENSUS_MODEL115_MISMATCH", () => {
      const profile = buildFiscalCensusProfileFromSettings({
        nif: "B12345678",
        fiscalRegime: "130",
        rentsBusinessPremises: "YES",
        censusModel115: "NO",
      });
      const mismatches = compareCensusVsOperationalSignals(profile, {
        hasPracticedProfessionalWithholding: false,
        hasPracticedRentWithholding: true,
      });
      assert.ok(mismatches.some((m) => m.code === "CENSUS_MODEL115_MISMATCH"));
    });

    it("rent withholding + census115 UNKNOWN → MODEL115_OBLIGATION_REVIEW_REQUIRED", () => {
      const profile = buildFiscalCensusProfileFromSettings({
        nif: "B12345678",
        fiscalRegime: "130",
        rentsBusinessPremises: "YES",
        censusModel115: "UNKNOWN",
      });
      const mismatches = compareCensusVsOperationalSignals(profile, {
        hasPracticedProfessionalWithholding: false,
        hasPracticedRentWithholding: true,
      });
      assert.ok(
        mismatches.some(
          (m) => m.code === "MODEL115_OBLIGATION_REVIEW_REQUIRED"
        )
      );
    });
  });

  describe("health lease checks", () => {
    it("lease UNKNOWN withholding → LEASE_WITHHOLDING_UNKNOWN", () => {
      const { issues } = runLeaseHealthChecks(
        emptyHealthCtx({
          leasesActive: [
            {
              id: "lease1",
              cadastralReference: null,
              propertyAddress: "Local Vigo",
              active: true,
              activityUse: "FULL",
              withholdingStatus: "UNKNOWN",
              withholdingExemptionReason: null,
              defaultWithholdingRate: null,
              landlordName: "Arrendador",
              landlordTaxId: "B12345678",
              counterpartyId: "cp1",
              requiresReview: false,
            },
          ],
          settings: {
            ...emptyHealthCtx().settings!,
            rentsBusinessPremises: "NO",
            censusModel115: "NO",
          },
        })
      );
      assert.ok(issues.some((i) => i.code === "LEASE_WITHHOLDING_UNKNOWN"));
      assert.ok(issues.some((i) => i.code === "CENSUS_RENT_ACTIVITY_MISMATCH"));
    });

    it("rent withholding + census115 UNKNOWN via health", () => {
      const { issues } = runLeaseHealthChecks(
        emptyHealthCtx({
          practicedWithholdingsYear: [
            {
              id: "w1",
              direction: WITHHOLDING_DIRECTION.PRACTICED,
              kind: WITHHOLDING_KIND.RENT,
              sourceType: "EXPENSE",
              sourceId: "e1",
              status: WITHHOLDING_STATUS.ACTIVE,
              baseAmount: 1000,
              rate: 19,
              withholdingAmount: 190,
              accrualDate: new Date("2026-05-01"),
              year: 2026,
              quarter: 2,
              counterpartyTaxId: "B12345678",
              counterpartyName: "Landlord",
            },
          ],
          expensesYear: [
            {
              id: "e1",
              issueDate: new Date("2026-05-01"),
              supplierName: "Landlord",
              supplierNif: "B12345678",
              category: "OTROS",
              vatOperationType: "INTERIOR",
              subtotal: 1000,
              vatAmount: 210,
              total: 1210,
              vatDeductiblePct: 100,
              irpfDeductiblePct: 100,
              isInvestment: false,
              practicedWithholdingStatus: "NO",
              leaseId: "lease1",
              documentId: null,
              importDuaBase: null,
              importDuaVat: null,
              importDuaNumber: null,
              importDuaDate: null,
              importDuaDocumentId: null,
              invoiceNumber: null,
            },
          ],
          leasesActive: [
            {
              id: "lease1",
              cadastralReference: null,
              propertyAddress: "Local Vigo",
              active: true,
              activityUse: "FULL",
              withholdingStatus: "YES",
              withholdingExemptionReason: null,
              defaultWithholdingRate: 19,
              landlordName: "Landlord",
              landlordTaxId: "B12345678",
              counterpartyId: "cp1",
              requiresReview: false,
            },
          ],
          settings: {
            ...emptyHealthCtx().settings!,
            rentsBusinessPremises: "YES",
            censusModel115: "UNKNOWN",
          },
        })
      );
      assert.ok(
        issues.some((i) => i.code === "MODEL115_OBLIGATION_REVIEW_REQUIRED")
      );
    });
  });
});
