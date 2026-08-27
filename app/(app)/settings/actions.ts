"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { normalizeTaxId, taxIdErrorMessage } from "@/lib/nif";
import { DEFAULT_THEME, sanitizeHex } from "@/lib/theme";
import { normalizeShopifyShop } from "@/lib/shopify-client";

export type SettingsState = { error?: string; success?: boolean };

function parseTri(raw: FormDataEntryValue | null): "YES" | "NO" | "UNKNOWN" {
  const v = String(raw ?? "UNKNOWN").toUpperCase().trim();
  if (v === "YES" || v === "SI" || v === "SÍ") return "YES";
  if (v === "NO") return "NO";
  return "UNKNOWN";
}

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
    simplifiedInvoiceMaxAmount: (() => {
      const n = parseFloat(
        String(formData.get("simplifiedInvoiceMaxAmount") ?? "400")
      );
      if (n >= 3000) return 3000;
      return 400;
    })(),
    fiscalRegime:
      String(formData.get("fiscalRegime") ?? "130") === "131" ? "131" : "130",
    irpfDirectEstimationMode:
      String(formData.get("irpfDirectEstimationMode") ?? "NORMAL").toUpperCase() ===
      "SIMPLIFIED"
        ? "SIMPLIFIED"
        : "NORMAL",
    previousYearNetIncome130Mode: (() => {
      const v = String(
        formData.get("previousYearNetIncome130Mode") ?? "UNKNOWN"
      ).toUpperCase();
      if (v === "NO_ACTIVITY") return "NO_ACTIVITY";
      if (v === "KNOWN") return "KNOWN";
      return "UNKNOWN";
    })(),
    previousYearNetIncomeFor130Reduction: (() => {
      const raw = String(
        formData.get("previousYearNetIncomeFor130Reduction") ?? ""
      ).trim();
      if (!raw) return null;
      const n = parseFloat(raw.replace(",", "."));
      return Number.isFinite(n) ? n : null;
    })(),
    irpf130HousingDeduction: (() => {
      const v = String(formData.get("irpf130HousingDeduction") ?? "NO").toUpperCase();
      if (
        v === "ELIGIBLE_CONFIRMED" ||
        v === "ELIGIBLE-CONFIRMED" ||
        v === "YES" ||
        v === "SI" ||
        v === "SÍ"
      ) {
        return "ELIGIBLE_CONFIRMED";
      }
      if (v === "UNKNOWN") return "UNKNOWN";
      return "NO";
    })(),
    agriculturalActivities130: (() => {
      const v = String(formData.get("agriculturalActivities130") ?? "NONE").toUpperCase();
      if (v === "HAS") return "HAS";
      if (v === "UNKNOWN") return "UNKNOWN";
      return "NONE";
    })(),
    irregularIncome130Status:
      String(formData.get("irregularIncome130Status") ?? "NONE").toUpperCase() ===
      "REVIEW_REQUIRED"
        ? "REVIEW_REQUIRED"
        : "NONE",
    activityKind130: (() => {
      const v = String(formData.get("activityKind130") ?? "UNKNOWN").toUpperCase();
      if (v === "PROFESSIONAL") return "PROFESSIONAL";
      if (v === "BUSINESS") return "BUSINESS";
      return "UNKNOWN";
    })(),
    priorYearWithholdingPct130: (() => {
      const raw = String(formData.get("priorYearWithholdingPct130") ?? "").trim();
      if (!raw) return null;
      const n = parseFloat(raw.replace(",", "."));
      return Number.isFinite(n) ? n : null;
    })(),
    vatUsesSii: (() => {
      const v = String(formData.get("vatUsesSii") ?? "UNKNOWN").toUpperCase();
      if (v === "YES" || v === "SI" || v === "SÍ") return "YES";
      if (v === "NO") return "NO";
      return "UNKNOWN";
    })(),
    vatPeriodicity: (() => {
      const v = String(formData.get("vatPeriodicity") ?? "UNKNOWN").toUpperCase();
      if (v === "QUARTERLY" || v === "TRIMESTRAL") return "QUARTERLY";
      if (v === "MONTHLY" || v === "MENSUAL") return "MONTHLY";
      return "UNKNOWN";
    })(),
    vatTerritory: (() => {
      const v = String(formData.get("vatTerritory") ?? "UNKNOWN").toUpperCase();
      if (v === "YES" || v === "COMMON_ONLY" || v === "COMUN") return "COMMON_ONLY";
      if (v === "NO" || v === "OTHER" || v === "OTRO") return "OTHER";
      return "UNKNOWN";
    })(),
    vatActivity390Scope: (() => {
      const v = String(formData.get("vatActivity390Scope") ?? "UNKNOWN").toUpperCase();
      if (v === "GENERAL") return "GENERAL";
      if (v === "SIMPLIFIED" || v === "SIMPLIFICADO") return "SIMPLIFIED";
      if (v === "URBAN_RENTAL" || v === "ALQUILER") return "URBAN_RENTAL";
      if (
        v === "SIMPLIFIED_AND_URBAN_RENTAL" ||
        v === "SIMPLIFICADO_Y_ALQUILER"
      ) {
        return "SIMPLIFIED_AND_URBAN_RENTAL";
      }
      return "UNKNOWN";
    })(),
    lastVatPeriodFilingRequired: (() => {
      const v = String(
        formData.get("lastVatPeriodFilingRequired") ?? "UNKNOWN"
      ).toUpperCase();
      if (v === "YES" || v === "SI" || v === "SÍ") return "YES";
      if (v === "NO") return "NO";
      return "UNKNOWN";
    })(),
    paysProfessionalsSubjectToWithholding: (() => {
      const v = String(
        formData.get("paysProfessionalsSubjectToWithholding") ?? "UNKNOWN"
      ).toUpperCase();
      if (v === "YES" || v === "SI" || v === "SÍ") return "YES";
      if (v === "NO") return "NO";
      return "UNKNOWN";
    })(),
    censusModel111: (() => {
      const v = String(formData.get("censusModel111") ?? "UNKNOWN").toUpperCase();
      if (v === "YES" || v === "SI" || v === "SÍ") return "YES";
      if (v === "NO") return "NO";
      return "UNKNOWN";
    })(),
    model111Periodicity: (() => {
      const v = String(
        formData.get("model111Periodicity") ?? "UNKNOWN"
      ).toUpperCase();
      if (v === "QUARTERLY" || v === "TRIMESTRAL") return "QUARTERLY";
      if (v === "MONTHLY" || v === "MENSUAL") return "MONTHLY";
      return "UNKNOWN";
    })(),
    model115Periodicity: (() => {
      const v = String(
        formData.get("model115Periodicity") ?? "UNKNOWN"
      ).toUpperCase();
      if (v === "QUARTERLY" || v === "TRIMESTRAL") return "QUARTERLY";
      if (v === "MONTHLY" || v === "MENSUAL") return "MONTHLY";
      return "UNKNOWN";
    })(),
    censusModel130: parseTri(formData.get("censusModel130")),
    censusModel303: parseTri(formData.get("censusModel303")),
    censusModel115: parseTri(formData.get("censusModel115")),
    censusModel180: parseTri(formData.get("censusModel180")),
    censusModel190: parseTri(formData.get("censusModel190")),
    censusModel349: parseTri(formData.get("censusModel349")),
    censusModel347: parseTri(formData.get("censusModel347")),
    censusModel390: parseTri(formData.get("censusModel390")),
    hasEmployees: parseTri(formData.get("hasEmployees")),
    rentsBusinessPremises: parseTri(formData.get("rentsBusinessPremises")),
    businessRentSubjectToWithholding: parseTri(
      formData.get("businessRentSubjectToWithholding")
    ),
    activityStartYear: (() => {
      const raw = String(formData.get("activityStartYear") ?? "").trim();
      if (!raw) return null;
      const n = parseInt(raw, 10);
      return Number.isFinite(n) && n >= 1990 && n <= 2100 ? n : null;
    })(),
    censusSource: "MANUAL" as const,
    censusLastUpdatedAt: new Date(),
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
  revalidatePath("/fiscal/close");
  revalidatePath("/fiscal/health");
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

export async function createQuoteSeries(formData: FormData) {
  await requireAuth();
  const prefix = String(formData.get("prefix") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!prefix || !name) return;
  const yearEnabled = formData.get("useYear") === "on";
  await prisma.quoteSeries.create({
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

export type FiscalReminderTestState =
  | { ok: true; to: string }
  | { ok: false; error: string };

/** Envía un email de prueba (no escribe en FiscalReminderLog). */
export async function sendFiscalReminderTest(): Promise<FiscalReminderTestState> {
  await requireAuth();

  const { isSmtpConfigured, sendMail, smtpConfigHint } = await import(
    "@/lib/mail"
  );
  const { buildUpcomingDeadlines } = await import("@/lib/fiscal-calendar");
  const { buildFiscalTestEmail } = await import("@/lib/fiscal-email");

  if (!isSmtpConfigured()) {
    return { ok: false, error: smtpConfigHint() };
  }

  const settings = await prisma.companySettings.findFirst();
  const to =
    settings?.fiscalReminderEmail?.trim() ||
    settings?.email?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    process.env.SMTP_USER?.trim() ||
    "";
  if (!to || !to.includes("@")) {
    return {
      ok: false,
      error:
        "Falta email destino. Pon el email de la empresa o el de recordatorios fiscales.",
    };
  }

  const auth = (process.env.AUTH_URL ?? "").trim().replace(/\/$/, "");
  const vercel = (process.env.VERCEL_URL ?? "").trim().replace(/\/$/, "");
  const base =
    auth || (vercel ? `https://${vercel}` : "https://vexo.wod3d.com");

  const mail = buildFiscalTestEmail({
    deadlines: buildUpcomingDeadlines(new Date()),
    baseUrl: base,
  });

  try {
    await sendMail({
      to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    return { ok: true, to };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo enviar",
    };
  }
}
