import { prisma } from "@/lib/prisma";

/** Modelos que suelen generar ingreso a AEAT cuando result > 0. */
export const PAYABLE_MODEL_TYPES = new Set(["303", "130"]);

export type PendingLiquidacion = {
  filingId: string;
  modelType: string;
  year: number;
  quarter: number | null;
  periodLabel: string;
  result: number;
  filedAt: Date | null;
  paymentHref: string;
};

export function periodLabelForFiling(
  modelType: string,
  year: number,
  quarter: number | null
): string {
  if (quarter == null || modelType === "390" || modelType === "347" || modelType === "036") {
    return `Año ${year}`;
  }
  return `${quarter}T ${year}`;
}

export function paymentHrefForFiling(opts: {
  filingId: string;
  modelType: string;
  year: number;
  quarter: number | null;
  amount: number;
}): string {
  const q = new URLSearchParams({
    filingId: opts.filingId,
    modelType: opts.modelType,
    year: String(opts.year),
    amount: opts.amount.toFixed(2),
  });
  if (opts.quarter != null) q.set("quarter", String(opts.quarter));
  return `/fiscal/payments?${q.toString()}`;
}

/**
 * Presentados con resultado > 0 (303/130) sin pago PAGADO ligado
 * (por filingId o por modelo+periodo).
 */
export async function listPendingLiquidaciones(): Promise<PendingLiquidacion[]> {
  const [filings, payments] = await Promise.all([
    prisma.fiscalFiling.findMany({
      where: {
        modelType: { in: [...PAYABLE_MODEL_TYPES] },
        result: { gt: 0 },
      },
      orderBy: [{ year: "desc" }, { quarter: "desc" }, { modelType: "asc" }],
    }),
    prisma.taxPayment.findMany({
      where: { status: "PAGADO" },
      select: {
        filingId: true,
        modelType: true,
        year: true,
        quarter: true,
      },
    }),
  ]);

  const paidFilingIds = new Set(
    payments.filter((p) => p.filingId).map((p) => p.filingId as string)
  );
  const paidKeys = new Set(
    payments
      .filter((p) => p.modelType && p.year != null)
      .map(
        (p) =>
          `${p.modelType}:${p.year}:${p.quarter ?? "A"}`
      )
  );

  const pending: PendingLiquidacion[] = [];
  for (const f of filings) {
    if (paidFilingIds.has(f.id)) continue;
    const key = `${f.modelType}:${f.year}:${f.quarter ?? "A"}`;
    if (paidKeys.has(key)) continue;
    const result = Number(f.result);
    pending.push({
      filingId: f.id,
      modelType: f.modelType,
      year: f.year,
      quarter: f.quarter,
      periodLabel: periodLabelForFiling(f.modelType, f.year, f.quarter),
      result,
      filedAt: f.filedAt,
      paymentHref: paymentHrefForFiling({
        filingId: f.id,
        modelType: f.modelType,
        year: f.year,
        quarter: f.quarter,
        amount: result,
      }),
    });
  }
  return pending;
}
