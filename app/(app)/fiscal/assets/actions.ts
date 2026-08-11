"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { buildLinearAmortization } from "@/lib/investment-amortization";

export async function updateInvestmentAsset(
  id: string,
  formData: FormData
): Promise<void> {
  await requireAuth();
  const usefulLifeYears =
    parseInt(String(formData.get("usefulLifeYears") ?? "4"), 10) || 4;
  const startYearRaw = parseInt(String(formData.get("startYear") ?? ""), 10);
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const asset = await prisma.investmentAsset.findUnique({ where: { id } });
  if (!asset) throw new Error("Bien no encontrado");

  const startYear = Number.isFinite(startYearRaw)
    ? startYearRaw
    : asset.startYear ??
      asset.purchaseDate?.getFullYear() ??
      new Date().getFullYear();

  const amort = buildLinearAmortization({
    base: Number(asset.base),
    usefulLifeYears,
    startYear,
  });

  await prisma.investmentAmortization.deleteMany({ where: { assetId: id } });
  await prisma.investmentAsset.update({
    where: { id },
    data: {
      usefulLifeYears,
      startYear,
      notes,
    },
  });
  for (const a of amort) {
    await prisma.investmentAmortization.create({
      data: {
        assetId: id,
        year: a.year,
        amount: new Prisma.Decimal(a.amount),
      },
    });
  }

  revalidatePath("/fiscal/assets");
}

export async function deleteInvestmentAsset(id: string) {
  await requireAuth();
  await prisma.investmentAsset.delete({ where: { id } });
  revalidatePath("/fiscal/assets");
}
