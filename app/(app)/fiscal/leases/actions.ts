"use server";

import {
  LEASE_EXEMPTION_REASON_LABELS,
  parseLeaseActivityUse,
  parseLeaseExemptionReason,
  parseLeaseWithholdingStatus,
} from "@/lib/fiscal-leases";
import {
  COUNTERPARTY_KIND,
  resolveOrCreateFiscalCounterparty,
} from "@/lib/fiscal-withholding";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

export type LeaseFormState = {
  error?: string;
};

function revalidateLeasePaths() {
  revalidatePath("/fiscal/leases");
  revalidatePath("/fiscal");
  revalidatePath("/fiscal/expenses");
  revalidatePath("/fiscal/expenses/new");
}

function parseLeaseForm(formData: FormData) {
  const startRaw = String(formData.get("startDate") ?? "").trim();
  const endRaw = String(formData.get("endDate") ?? "").trim();
  const rateRaw = String(formData.get("defaultWithholdingRate") ?? "").trim();
  const withholdingStatus = parseLeaseWithholdingStatus(
    formData.get("withholdingStatus")
  );
  const exemption =
    withholdingStatus === "NO"
      ? parseLeaseExemptionReason(formData.get("withholdingExemptionReason"))
      : null;

  return {
    landlordName: String(formData.get("landlordName") ?? "").trim(),
    landlordNif: String(formData.get("landlordNif") ?? "").trim() || null,
    propertyAddress: String(formData.get("propertyAddress") ?? "").trim(),
    postalCode: String(formData.get("postalCode") ?? "").trim() || null,
    municipality: String(formData.get("municipality") ?? "").trim() || null,
    province: String(formData.get("province") ?? "").trim() || null,
    countryCode:
      String(formData.get("countryCode") ?? "ES").trim().toUpperCase() || "ES",
    cadastralReference:
      String(formData.get("cadastralReference") ?? "").trim() || null,
    startDate: startRaw ? new Date(startRaw) : new Date(),
    endDate: endRaw ? new Date(endRaw) : null,
    activityUse: parseLeaseActivityUse(formData.get("activityUse")),
    withholdingStatus,
    withholdingExemptionReason: exemption,
    defaultWithholdingRate: (() => {
      if (!rateRaw) return null;
      const n = parseFloat(rateRaw.replace(",", "."));
      return Number.isFinite(n) ? n : null;
    })(),
    active: formData.get("active") !== "0" && formData.get("active") !== "off",
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

function validateLease(data: ReturnType<typeof parseLeaseForm>): string | null {
  if (!data.landlordName) return "El nombre del arrendador es obligatorio";
  if (!data.propertyAddress) return "La dirección del inmueble es obligatoria";
  if (!(data.startDate instanceof Date) || Number.isNaN(data.startDate.getTime())) {
    return "Fecha de inicio no válida";
  }
  if (
    data.endDate &&
    (!(data.endDate instanceof Date) || Number.isNaN(data.endDate.getTime()))
  ) {
    return "Fecha de fin no válida";
  }
  if (data.withholdingStatus === "NO" && !data.withholdingExemptionReason) {
    return "Indica el motivo de no retención (dato revisable)";
  }
  if (
    data.withholdingStatus === "YES" &&
    data.defaultWithholdingRate != null &&
    data.defaultWithholdingRate < 0
  ) {
    return "El tipo de retención no puede ser negativo";
  }
  return null;
}

export async function createLease(
  _prev: LeaseFormState,
  formData: FormData
): Promise<LeaseFormState> {
  await requireAuth();
  try {
    const data = parseLeaseForm(formData);
    const err = validateLease(data);
    if (err) return { error: err };

    const counterparty = await resolveOrCreateFiscalCounterparty({
      taxId: data.landlordNif,
      name: data.landlordName,
      kind: COUNTERPARTY_KIND.LANDLORD,
      countryCode: data.countryCode,
      allowMissingTaxId: true,
    });

    await prisma.businessPremisesLease.create({
      data: {
        counterpartyId: counterparty.id,
        propertyAddress: data.propertyAddress,
        postalCode: data.postalCode,
        municipality: data.municipality,
        province: data.province,
        countryCode: data.countryCode,
        cadastralReference: data.cadastralReference,
        startDate: data.startDate,
        endDate: data.endDate,
        activityUse: data.activityUse,
        withholdingStatus: data.withholdingStatus,
        withholdingExemptionReason: data.withholdingExemptionReason,
        defaultWithholdingRate: data.defaultWithholdingRate,
        active: data.active,
        notes: data.notes,
      },
    });

    revalidateLeasePaths();
    redirect("/fiscal/leases");
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { error: e instanceof Error ? e.message : "Error al crear" };
  }
}

export async function updateLease(
  id: string,
  _prev: LeaseFormState,
  formData: FormData
): Promise<LeaseFormState> {
  await requireAuth();
  try {
    const data = parseLeaseForm(formData);
    const err = validateLease(data);
    if (err) return { error: err };

    const existing = await prisma.businessPremisesLease.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) return { error: "Local no encontrado" };

    const counterparty = await resolveOrCreateFiscalCounterparty({
      taxId: data.landlordNif,
      name: data.landlordName,
      kind: COUNTERPARTY_KIND.LANDLORD,
      countryCode: data.countryCode,
      allowMissingTaxId: true,
    });

    await prisma.businessPremisesLease.update({
      where: { id },
      data: {
        counterpartyId: counterparty.id,
        propertyAddress: data.propertyAddress,
        postalCode: data.postalCode,
        municipality: data.municipality,
        province: data.province,
        countryCode: data.countryCode,
        cadastralReference: data.cadastralReference,
        startDate: data.startDate,
        endDate: data.endDate,
        activityUse: data.activityUse,
        withholdingStatus: data.withholdingStatus,
        withholdingExemptionReason: data.withholdingExemptionReason,
        defaultWithholdingRate: data.defaultWithholdingRate,
        active: data.active,
        notes: data.notes,
      },
    });

    revalidateLeasePaths();
    redirect("/fiscal/leases");
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { error: e instanceof Error ? e.message : "Error al guardar" };
  }
}

export async function deactivateLease(id: string) {
  await requireAuth();
  await prisma.businessPremisesLease.update({
    where: { id },
    data: { active: false },
  });
  revalidateLeasePaths();
  redirect("/fiscal/leases");
}

export { LEASE_EXEMPTION_REASON_LABELS };
