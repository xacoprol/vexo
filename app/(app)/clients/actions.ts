"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { normalizeTaxId, taxIdErrorMessage } from "@/lib/nif";

export type ClientFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function parseClientForm(formData: FormData) {
  const countryCode = String(formData.get("countryCode") ?? "ES")
    .trim()
    .toUpperCase() || "ES";
  return {
    name: String(formData.get("name") ?? "").trim(),
    nif: normalizeTaxId(String(formData.get("nif") ?? "")),
    countryCode,
    addressStreet: String(formData.get("addressStreet") ?? "").trim(),
    addressCity: String(formData.get("addressCity") ?? "").trim(),
    addressProvince: String(formData.get("addressProvince") ?? "").trim(),
    addressZip: String(formData.get("addressZip") ?? "").trim(),
    addressCountry: String(formData.get("addressCountry") ?? "España").trim(),
    email: String(formData.get("email") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    contactPerson: String(formData.get("contactPerson") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

function validateClient(data: ReturnType<typeof parseClientForm>) {
  const fieldErrors: Record<string, string> = {};
  if (!data.name) fieldErrors.name = "El nombre es obligatorio";
  const nifErr = taxIdErrorMessage(data.nif, data.countryCode);
  if (nifErr) fieldErrors.nif = nifErr;
  if (!data.addressStreet) fieldErrors.addressStreet = "Obligatorio";
  if (!data.addressCity) fieldErrors.addressCity = "Obligatorio";
  if (!data.addressProvince) fieldErrors.addressProvince = "Obligatorio";
  if (!data.addressZip) fieldErrors.addressZip = "Obligatorio";
  return fieldErrors;
}

export async function createClient(
  _prev: ClientFormState,
  formData: FormData
): Promise<ClientFormState> {
  await requireAuth();
  const data = parseClientForm(formData);
  const fieldErrors = validateClient(data);
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const client = await prisma.client.create({ data });
  revalidatePath("/clients");
  redirect(`/clients/${client.id}`);
}

/** Crea cliente sin redirect — para modal del combobox. */
export async function createClientQuick(
  formData: FormData
): Promise<
  | {
      ok: true;
      client: { id: string; name: string; nif: string; email: string | null; countryCode: string };
    }
  | { ok: false; error?: string; fieldErrors?: Record<string, string> }
> {
  await requireAuth();
  const data = parseClientForm(formData);
  const fieldErrors = validateClient(data);
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };

  try {
    const client = await prisma.client.create({ data });
    revalidatePath("/clients");
    return {
      ok: true,
      client: {
        id: client.id,
        name: client.name,
        nif: client.nif,
        email: client.email,
        countryCode: client.countryCode,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "No se pudo crear el cliente",
    };
  }
}

export async function updateClient(
  id: string,
  _prev: ClientFormState,
  formData: FormData
): Promise<ClientFormState> {
  await requireAuth();
  const data = parseClientForm(formData);
  const fieldErrors = validateClient(data);
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  await prisma.client.update({ where: { id }, data });
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  redirect(`/clients/${id}`);
}

export async function deleteClient(id: string) {
  await requireAuth();
  const [quotes, invoices, recurring] = await Promise.all([
    prisma.quote.count({ where: { clientId: id } }),
    prisma.invoice.count({ where: { clientId: id } }),
    prisma.recurringInvoiceTemplate.count({ where: { clientId: id } }),
  ]);
  if (quotes + invoices + recurring > 0) {
    throw new Error(
      "No se puede eliminar: el cliente tiene presupuestos, facturas o periódicas asociadas."
    );
  }
  await prisma.client.delete({ where: { id } });
  revalidatePath("/clients");
  redirect("/clients");
}
