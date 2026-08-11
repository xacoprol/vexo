"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { buildLinearAmortization } from "@/lib/investment-amortization";
import {
  isExpenseIntracom,
  parseExpenseVatOperationType,
} from "@/lib/fiscal";

export type AssetFormState = { error?: string };

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function parseMoney(raw: FormDataEntryValue | null): number {
  const n = Number(String(raw ?? "0").replace(",", "."));
  return Number.isFinite(n) ? round2(n) : 0;
}

async function rebuildAssetAmortizations(
  assetId: string,
  base: number,
  usefulLifeYears: number,
  startYear: number
) {
  const amort = buildLinearAmortization({
    base,
    usefulLifeYears,
    startYear,
  });
  await prisma.investmentAmortization.deleteMany({ where: { assetId } });
  for (const a of amort) {
    await prisma.investmentAmortization.create({
      data: {
        assetId,
        year: a.year,
        amount: new Prisma.Decimal(a.amount),
      },
    });
  }
}

export async function createInvestmentAsset(
  _prev: AssetFormState,
  formData: FormData
): Promise<AssetFormState> {
  await requireAuth();

  const description = String(formData.get("description") ?? "").trim();
  if (!description) return { error: "La descripción es obligatoria" };

  const purchaseRaw = String(formData.get("purchaseDate") ?? "").trim();
  const purchaseDate = purchaseRaw
    ? new Date(`${purchaseRaw}T12:00:00`)
    : new Date();
  if (Number.isNaN(purchaseDate.getTime())) {
    return { error: "Fecha no válida" };
  }

  const base = parseMoney(formData.get("base"));
  if (base <= 0) return { error: "La base debe ser mayor que 0" };

  const vatOperationType = parseExpenseVatOperationType(
    formData.get("vatOperationType")
  );
  const vatAmount = isExpenseIntracom(vatOperationType)
    ? 0
    : Math.max(0, parseMoney(formData.get("vatAmount")));

  const usefulLifeYears =
    parseInt(String(formData.get("usefulLifeYears") ?? "4"), 10) || 4;
  const startYear = purchaseDate.getFullYear();
  const supplierName =
    String(formData.get("supplierName") ?? "").trim() || null;
  const supplierNif =
    String(formData.get("supplierNif") ?? "").trim() || null;
  const invoiceNumber =
    String(formData.get("invoiceNumber") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const asset = await prisma.investmentAsset.create({
    data: {
      description,
      supplierName,
      supplierNif,
      invoiceNumber,
      purchaseDate,
      base: new Prisma.Decimal(base),
      vatAmount: new Prisma.Decimal(vatAmount),
      vatOperationType,
      usefulLifeYears,
      startYear,
      notes,
    },
  });
  await rebuildAssetAmortizations(
    asset.id,
    base,
    usefulLifeYears,
    startYear
  );

  revalidatePath("/fiscal/assets");
  revalidatePath("/fiscal/130");
  revalidatePath("/fiscal/303");
  revalidatePath("/fiscal");
  redirect("/fiscal/assets");
}

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

  await prisma.investmentAsset.update({
    where: { id },
    data: {
      usefulLifeYears,
      startYear,
      notes,
    },
  });
  await rebuildAssetAmortizations(
    id,
    Number(asset.base),
    usefulLifeYears,
    startYear
  );

  revalidatePath("/fiscal/assets");
  revalidatePath("/fiscal/130");
}

export async function deleteInvestmentAsset(id: string) {
  await requireAuth();
  await prisma.investmentAsset.delete({ where: { id } });
  revalidatePath("/fiscal/assets");
  revalidatePath("/fiscal/130");
}
