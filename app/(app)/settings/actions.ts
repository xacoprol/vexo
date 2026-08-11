"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { normalizeTaxId, taxIdErrorMessage } from "@/lib/nif";
import { DEFAULT_THEME, sanitizeHex } from "@/lib/theme";
import { normalizeShopifyShop } from "@/lib/shopify-client";

export type SettingsState = { error?: string; success?: boolean };

const LOGO_MAX_BYTES = 1.5 * 1024 * 1024;
const LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

async function resolveLogoUrl(
  formData: FormData
): Promise<{ logoUrl: string | null } | { error: string }> {
  if (formData.get("removeLogo") === "1") {
    return { logoUrl: null };
  }

  const file = formData.get("logoFile");
  if (file instanceof File && file.size > 0) {
    if (!LOGO_TYPES.has(file.type)) {
      return { error: "El logo debe ser PNG, JPG, WebP o GIF." };
    }
    if (file.size > LOGO_MAX_BYTES) {
      return { error: "El logo no puede superar 1,5 MB." };
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    return { logoUrl: `data:${file.type};base64,${base64}` };
  }

  const existing = String(formData.get("logoUrl") ?? "").trim();
  return { logoUrl: existing || null };
}

export async function updateSettings(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  await requireAuth();
  const nif = normalizeTaxId(String(formData.get("nif") ?? ""));
  const nifErr = taxIdErrorMessage(nif, "ES");
  if (nif && nifErr) return { error: nifErr };

  const logoResult = await resolveLogoUrl(formData);
  if ("error" in logoResult) return { error: logoResult.error };

  const data = {
    name: String(formData.get("name") ?? "").trim(),
    companyName: String(formData.get("companyName") ?? "").trim(),
    nif,
    addressStreet: String(formData.get("addressStreet") ?? "").trim(),
    addressCity: String(formData.get("addressCity") ?? "").trim(),
    addressProvince: String(formData.get("addressProvince") ?? "").trim(),
    addressZip: String(formData.get("addressZip") ?? "").trim(),
    addressCountry: String(formData.get("addressCountry") ?? "España").trim(),
    email: String(formData.get("email") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    logoUrl: logoResult.logoUrl,
    defaultVatRate: parseFloat(String(formData.get("defaultVatRate") ?? "21")),
    defaultIrpfRate: parseFloat(String(formData.get("defaultIrpfRate") ?? "15")),
    fiscalRegime:
      String(formData.get("fiscalRegime") ?? "130") === "131" ? "131" : "130",
    emailSubject: String(formData.get("emailSubject") ?? "").trim(),
    emailBody: String(formData.get("emailBody") ?? "").trim(),
    bankIban: String(formData.get("bankIban") ?? "").trim() || null,
    bankName: String(formData.get("bankName") ?? "").trim() || null,
    bizumPhone:
      String(formData.get("bizumPhone") ?? "").trim() || "603024030",
    reminderEnabled: formData.get("reminderEnabled") === "on" || formData.get("reminderEnabled") === "1",
    reminderDaysBefore: Math.max(
      0,
      parseInt(String(formData.get("reminderDaysBefore") ?? "3"), 10) || 3
    ),
    reminderOnOverdue:
      formData.get("reminderOnOverdue") === "on" ||
      formData.get("reminderOnOverdue") === "1",
    reminderSubject: String(formData.get("reminderSubject") ?? "").trim(),
    reminderBody: String(formData.get("reminderBody") ?? "").trim(),
    fiscalReminderEnabled:
      formData.get("fiscalReminderEnabled") === "on" ||
      formData.get("fiscalReminderEnabled") === "1",
    fiscalReminderEmail: String(formData.get("fiscalReminderEmail") ?? "").trim(),
    themeBg: sanitizeHex(
      String(formData.get("themeBg") ?? ""),
      DEFAULT_THEME.themeBg
    ),
    themeBgElevated: sanitizeHex(
      String(formData.get("themeBgElevated") ?? ""),
      DEFAULT_THEME.themeBgElevated
    ),
    themeInk: sanitizeHex(
      String(formData.get("themeInk") ?? ""),
      DEFAULT_THEME.themeInk
    ),
    themeInkMuted: sanitizeHex(
      String(formData.get("themeInkMuted") ?? ""),
      DEFAULT_THEME.themeInkMuted
    ),
    themeLine: sanitizeHex(
      String(formData.get("themeLine") ?? ""),
      DEFAULT_THEME.themeLine
    ),
    themeAccent: sanitizeHex(
      String(formData.get("themeAccent") ?? ""),
      DEFAULT_THEME.themeAccent
    ),
    themeAccentHover: sanitizeHex(
      String(formData.get("themeAccentHover") ?? ""),
      DEFAULT_THEME.themeAccentHover
    ),
    themeAccentSoft: sanitizeHex(
      String(formData.get("themeAccentSoft") ?? ""),
      DEFAULT_THEME.themeAccentSoft
    ),
    themeSidebar: sanitizeHex(
      String(formData.get("themeSidebar") ?? ""),
      DEFAULT_THEME.themeSidebar
    ),
    themeSidebarText: sanitizeHex(
      String(formData.get("themeSidebarText") ?? ""),
      DEFAULT_THEME.themeSidebarText
    ),
  };

  const shopRaw = String(formData.get("shopifyShop") ?? "").trim();
  const shopNormalized = shopRaw ? normalizeShopifyShop(shopRaw) : null;
  if (shopRaw && !shopNormalized) {
    return {
      error:
        "Tienda Shopify: usa el dominio admin (ej. wod3d.myshopify.com), no el .com público.",
    };
  }
  const clientIdRaw = String(formData.get("shopifyClientId") ?? "").trim();
  const clientSecretRaw = String(
    formData.get("shopifyClientSecret") ?? ""
  ).trim();
  const clearSecret = formData.get("clearShopifySecret") === "1";

  const existing = await prisma.companySettings.findFirst();
  const shopifyData: {
    shopifyShop: string | null;
    shopifyClientId: string | null;
    shopifyClientSecret?: string | null;
  } = {
    shopifyShop: shopNormalized,
    shopifyClientId: clientIdRaw || null,
  };
  if (clearSecret) {
    shopifyData.shopifyClientSecret = null;
  } else if (clientSecretRaw) {
    shopifyData.shopifyClientSecret = clientSecretRaw;
  }

  if (existing) {
    await prisma.companySettings.update({
      where: { id: existing.id },
      data: { ...data, ...shopifyData },
    });
  } else {
    await prisma.companySettings.create({
      data: { ...data, ...shopifyData },
    });
  }

  revalidatePath("/", "layout");
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/fiscal");
  return { success: true };
}

export async function createInvoiceSeries(formData: FormData) {
  await requireAuth();
  const prefix = String(formData.get("prefix") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!prefix || !name) return;
  const yearEnabled = formData.get("useYear") === "on";
  await prisma.invoiceSeries.create({
    data: {
      prefix,
      name,
      nextNumber: 1,
      year: yearEnabled ? new Date().getFullYear() : null,
      padLength: 3,
      isDefault: false,
    },
  });
  revalidatePath("/settings");
}
