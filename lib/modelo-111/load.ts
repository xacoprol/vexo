import type { FiscalQuarter } from "@/lib/fiscal";
import { prisma } from "@/lib/prisma";
import { buildModel111 } from "@/lib/modelo-111/engine";
import type {
  Model111Result,
  Model111WithholdingRow,
} from "@/lib/modelo-111/types";
import {
  WITHHOLDING_DIRECTION,
  WITHHOLDING_KIND,
} from "@/lib/fiscal-withholding";

/**
 * Carga withholdings profesionales del ejercicio (índice year laxo) y construye 111.
 * El filtro fiscal de período usa paymentDate en el motor.
 */
export async function buildModelo111Draft(
  year: number,
  quarter: FiscalQuarter,
  month?: number | null
): Promise<Model111Result> {
  const [settings, rows] = await Promise.all([
    prisma.companySettings.findFirst({
      select: {
        censusModel111: true,
        paysProfessionalsSubjectToWithholding: true,
        hasEmployees: true,
        model111Periodicity: true,
      },
    }),
    prisma.fiscalWithholding.findMany({
      where: {
        direction: WITHHOLDING_DIRECTION.PRACTICED,
        kind: WITHHOLDING_KIND.PROFESSIONAL,
        OR: [
          { year },
          { year: year - 1 },
          { year: year + 1 },
          { paymentDate: { not: null } },
        ],
      },
      include: {
        counterparty: {
          select: {
            id: true,
            name: true,
            taxId: true,
            normalizedTaxId: true,
            kind: true,
            countryCode: true,
            requiresReview: true,
          },
        },
      },
      orderBy: { paymentDate: "asc" },
    }),
  ]);

  const withholdings: Model111WithholdingRow[] = rows.map((w) => ({
    id: w.id,
    direction: w.direction,
    kind: w.kind,
    status: w.status,
    rectifiesId: w.rectifiesId,
    counterpartyId: w.counterpartyId,
    sourceType: w.sourceType,
    sourceId: w.sourceId,
    baseAmount: Number(w.baseAmount),
    rate: w.rate,
    withholdingAmount: Number(w.withholdingAmount),
    accrualDate: w.accrualDate,
    paymentDate: w.paymentDate,
    year: w.year,
    quarter: w.quarter,
    counterparty: w.counterparty,
  }));

  return buildModel111({
    year,
    quarter,
    month: month ?? null,
    withholdings,
    censusModel111: settings?.censusModel111,
    paysProfessionalsSubjectToWithholding:
      settings?.paysProfessionalsSubjectToWithholding,
    hasEmployees: settings?.hasEmployees,
    model111Periodicity: settings?.model111Periodicity,
  });
}
