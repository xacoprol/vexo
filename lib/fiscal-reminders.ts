import { prisma } from "@/lib/prisma";
import { isSmtpConfigured, sendMail } from "@/lib/mail";
import {
  buildUpcomingDeadlines,
  daysUntil,
  type FilingDeadline,
} from "@/lib/fiscal-calendar";
import {
  buildAeatCommsEmail,
  buildFiscalDeadlineEmail,
  type ReminderKind,
} from "@/lib/fiscal-email";
import { fiscalFilingPeriodKey } from "@/lib/gemini-fiscal-filing";
import type { FiscalModelType } from "@/lib/gemini-fiscal-filing";
import { buildModelo349Draft } from "@/lib/fiscal-347-349";
import type { FiscalQuarter } from "@/lib/fiscal";

const REMINDER_DAYS = [14, 3, 0] as const;

function kindForDays(d: number): ReminderKind | null {
  // Ventana corta: si el cron falla un día, el siguiente sigue enviando
  if (d >= 12 && d <= 14) return "14d";
  if (d >= 2 && d <= 3) return "3d";
  if (d >= -1 && d <= 0) return "due";
  return null;
}

function appBaseUrl(): string {
  const auth = (process.env.AUTH_URL ?? "").trim().replace(/\/$/, "");
  if (auth) return auth;
  const vercel = (process.env.VERCEL_URL ?? "").trim().replace(/\/$/, "");
  if (vercel) return `https://${vercel}`;
  return "https://vexo.wod3d.com";
}

function periodKeyFor(d: FilingDeadline): string {
  if (d.model === "100") return `100:${d.year}`;
  return fiscalFilingPeriodKey(
    d.model as FiscalModelType,
    d.year,
    d.quarter
  );
}

export async function runFiscalDeadlineReminders(now = new Date()) {
  const settings = await prisma.companySettings.findFirst();
  if (settings && settings.fiscalReminderEnabled === false) {
    return { skipped: true as const, reason: "Fiscal reminders disabled", sent: 0 };
  }
  if (!isSmtpConfigured()) {
    return { skipped: true as const, reason: "SMTP not configured", sent: 0 };
  }

  const to =
    settings?.fiscalReminderEmail?.trim() ||
    settings?.email?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    process.env.SMTP_USER?.trim() ||
    "";
  if (!to || !to.includes("@")) {
    return {
      skipped: true as const,
      reason: "No fiscal reminder email (ponlo en Ajustes → email empresa)",
      sent: 0,
    };
  }

  const deadlines = buildUpcomingDeadlines(now);
  const base = appBaseUrl();
  const sent: { periodKey: string; kind: string; model: string }[] = [];
  const skipped: string[] = [];

  for (const d of deadlines) {
    if (!["303", "130", "349", "390", "347", "100"].includes(d.model)) continue;

    const days = daysUntil(d.dueDate, now);
    const kind = kindForDays(days);
    if (!kind) continue;

    const periodKey = periodKeyFor(d);

    if (d.model !== "100") {
      const alreadyPresented = await prisma.fiscalFiling.findUnique({
        where: { periodKey },
        select: { id: true },
      });
      if (alreadyPresented) {
        skipped.push(`${periodKey} already presented`);
        continue;
      }
    }

    if (d.model === "349" && d.quarter != null) {
      const draft349 = await buildModelo349Draft(
        d.year,
        d.quarter as FiscalQuarter
      );
      if (!draft349.needsAttention) {
        skipped.push(`${periodKey} no intracom ops`);
        continue;
      }
    }

    const existing = await prisma.fiscalReminderLog.findUnique({
      where: { periodKey_kind: { periodKey, kind } },
    });
    if (existing) {
      skipped.push(`${periodKey} ${kind} already sent`);
      continue;
    }

    const mail = buildFiscalDeadlineEmail({
      deadline: d,
      kind,
      baseUrl: base,
    });

    await sendMail({
      to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    await prisma.fiscalReminderLog.create({
      data: { periodKey, kind, toEmail: to, subject: mail.subject },
    });
    sent.push({ periodKey, kind, model: d.model });
  }

  // Plazos de comunicaciones AEAT abiertas
  const aeatOpen = await prisma.aeatCommunication.findMany({
    where: { status: "ABIERTA", dueAt: { not: null } },
    select: { id: true, subject: true, dueAt: true, kind: true },
  });
  for (const a of aeatOpen) {
    if (!a.dueAt) continue;
    const days = daysUntil(a.dueAt, now);
    const kind = kindForDays(days);
    if (!kind) continue;
    const periodKey = `aeat:${a.id}`;
    const existing = await prisma.fiscalReminderLog.findUnique({
      where: { periodKey_kind: { periodKey, kind } },
    });
    if (existing) {
      skipped.push(`${periodKey} ${kind} already sent`);
      continue;
    }
    const dueLabel = a.dueAt.toISOString().slice(0, 10);
    const mail = buildAeatCommsEmail({
      kind,
      subjectLabel: a.subject,
      aeatKind: a.kind,
      dueLabel,
      baseUrl: base,
    });
    await sendMail({
      to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    await prisma.fiscalReminderLog.create({
      data: { periodKey, kind, toEmail: to, subject: mail.subject },
    });
    sent.push({ periodKey, kind, model: "AEAT" });
  }

  return {
    skipped: false as const,
    sent: sent.length,
    details: sent,
    skippedDetails: skipped,
    to,
  };
}

export { REMINDER_DAYS };
