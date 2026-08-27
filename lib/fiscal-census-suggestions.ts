/**
 * Sugerencias censales informativas (Fase 13).
 * Nunca persisten solas: requiresConfirmation siempre true.
 */

import type { PrismaClient } from "@prisma/client";

export type FiscalCensusSuggestion = {
  field: string;
  suggestedValue: string | number;
  reason: string;
  evidence: string[];
  confidence: "high" | "medium" | "low";
  requiresConfirmation: true;
  href?: string;
};

type SettingsLike = Record<string, unknown> | null;

function isUnknown(v: unknown): boolean {
  return (
    v == null ||
    v === "" ||
    String(v).toUpperCase() === "UNKNOWN"
  );
}

/**
 * Deriva sugerencias desde filings históricos + operaciones.
 * No escribe CompanySettings.
 */
export async function buildFiscalCensusSuggestions(
  prisma: PrismaClient,
  settings: SettingsLike
): Promise<FiscalCensusSuggestion[]> {
  const out: FiscalCensusSuggestion[] = [];
  const s = settings ?? {};

  const filings = await prisma.fiscalFiling.findMany({
    select: { modelType: true, year: true, quarter: true, result: true },
    orderBy: [{ year: "desc" }, { quarter: "desc" }],
    take: 40,
  });
  const hasModel = (m: string) => filings.some((f) => f.modelType === m);
  const countModel = (m: string) =>
    filings.filter((f) => f.modelType === m).length;

  const [intraCount, withholdingCount, leaseCount, invoiceIssued] =
    await Promise.all([
      prisma.expense.count({
        where: {
          vatOperationType: {
            in: ["INTRACOMUNITARIA", "SERVICIO_INTRACOMUNITARIO"],
          },
        },
      }),
      prisma.fiscalWithholding.count({ where: { status: "ACTIVE" } }),
      prisma.businessPremisesLease.count({ where: { active: true } }),
      prisma.invoice.count({ where: { fiscalStatus: "ISSUED" } }),
    ]);

  if (isUnknown(s.censusModel303) && hasModel("303")) {
    out.push({
      field: "censusModel303",
      suggestedValue: "YES",
      reason:
        "Hay autoliquidaciones 303 registradas. Revisa si el modelo figura en tu censo.",
      evidence: [
        `${countModel("303")} filing(s) 303 en VEXO`,
        "No se activa automáticamente",
      ],
      confidence: "high",
      requiresConfirmation: true,
      href: "/settings#census-303",
    });
  }

  if (isUnknown(s.vatPeriodicity) && hasModel("303")) {
    const quarters = new Set(
      filings
        .filter((f) => f.modelType === "303" && f.quarter != null)
        .map((f) => f.quarter)
    );
    out.push({
      field: "vatPeriodicity",
      suggestedValue: "QUARTERLY",
      reason:
        "Los 303 presentados tienen trimestre. Suele corresponder a IVA trimestral (autónomo).",
      evidence: [
        `Trimestres vistos en filings 303: ${[...quarters].sort().join(", ") || "—"}`,
        "Confirma si no eres gran empresa / SII mensual",
      ],
      confidence: "medium",
      requiresConfirmation: true,
      href: "/settings#vat-periodicity",
    });
  }

  if (isUnknown(s.censusModel130) && hasModel("130")) {
    out.push({
      field: "censusModel130",
      suggestedValue: "YES",
      reason: "Hay pagos fraccionados 130 registrados.",
      evidence: [`${countModel("130")} filing(s) 130`],
      confidence: "high",
      requiresConfirmation: true,
      href: "/settings#census-130",
    });
  }

  if (isUnknown(s.censusModel349) && (hasModel("349") || intraCount > 0)) {
    out.push({
      field: "censusModel349",
      suggestedValue: "YES",
      reason:
        "Hay 349 presentado y/o gastos intracomunitarios. Confirma ROI / censo 349.",
      evidence: [
        hasModel("349") ? `${countModel("349")} filing(s) 349` : null,
        intraCount > 0 ? `${intraCount} gasto(s) UE en libro` : null,
      ].filter(Boolean) as string[],
      confidence: hasModel("349") ? "high" : "medium",
      requiresConfirmation: true,
      href: "/settings#census-349",
    });
  }

  if (isUnknown(s.censusModel111) || isUnknown(s.paysProfessionalsSubjectToWithholding)) {
    if (withholdingCount > 0) {
      out.push({
        field: "censusModel111",
        suggestedValue: "YES",
        reason:
          "Hay retenciones practicadas registradas — revisa si el 111 figura en censo.",
        evidence: [`FiscalWithholding activas: ${withholdingCount}`],
        confidence: "medium",
        requiresConfirmation: true,
        href: "/settings#census-111",
      });
    } else if (isUnknown(s.censusModel111)) {
      out.push({
        field: "censusModel111",
        suggestedValue: "NO",
        reason:
          "No hay retenciones en VEXO. Si no practicas retención a profesionales, marca 111 = NO. Si sí practicas, marca YES aunque este trimestre sea 0.",
        evidence: [
          "FiscalWithholding activas: 0",
          "0 ops ≠ prueba de no obligación — confirma explícitamente",
        ],
        confidence: "low",
        requiresConfirmation: true,
        href: "/settings#census-111",
      });
    }
  }

  if (isUnknown(s.censusModel115) || isUnknown(s.rentsBusinessPremises)) {
    if (leaseCount > 0) {
      out.push({
        field: "rentsBusinessPremises",
        suggestedValue: "YES",
        reason: "Hay locales activos — revisa 115 / retención arrendamiento.",
        evidence: [`BusinessPremisesLease activos: ${leaseCount}`],
        confidence: "medium",
        requiresConfirmation: true,
        href: "/settings#census-115",
      });
    } else if (isUnknown(s.rentsBusinessPremises)) {
      out.push({
        field: "rentsBusinessPremises",
        suggestedValue: "NO",
        reason:
          "No hay locales en VEXO. Si no alquilas local afecto, marca NO. Si alquilas, registra el lease y marca YES.",
        evidence: [
          "BusinessPremisesLease activos: 0",
          "0 leases ≠ prueba automática — confirma",
        ],
        confidence: "low",
        requiresConfirmation: true,
        href: "/settings#census-115",
      });
    }
  }

  if (isUnknown(s.activityKind130) && invoiceIssued > 0) {
    out.push({
      field: "activityKind130",
      suggestedValue: "PROFESSIONAL",
      reason:
        "Hay facturas emitidas. Indica si la actividad es profesional o empresarial (afecta 130). Valor sugerido orientativo — confirma.",
      evidence: [`${invoiceIssued} factura(s) ISSUED`],
      confidence: "low",
      requiresConfirmation: true,
      href: "/settings#activity-kind-130",
    });
  }

  return out;
}
