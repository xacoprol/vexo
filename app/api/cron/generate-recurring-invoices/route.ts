import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateDocument, formatCurrency } from "@/lib/calculations";
import { allocateQuoteNumber } from "@/lib/numbering";
import { advanceDate, isZeroVatOperation, type Frequency } from "@/lib/recurring";
import { isSmtpConfigured, sendMail } from "@/lib/mail";
import { parseISO, isValid } from "date-fns";

/** Clave de día local YYYY-MM-DD (evita desfases UTC en comparaciones) */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function localNoonFromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function appBaseUrl(): string {
  const auth = (process.env.AUTH_URL ?? "").trim().replace(/\/$/, "");
  if (auth) return auth;
  const vercel = (process.env.VERCEL_URL ?? "").trim().replace(/\/$/, "");
  if (vercel) return `https://${vercel}`;
  return "https://vexo.wod3d.com";
}

type GenDetail = {
  templateId: string;
  name: string;
  clientName?: string;
  clientEmail?: string | null;
  quoteId?: string;
  fullNumber?: string;
  subtotal?: number;
  vatAmount?: number;
  total?: number;
  error?: string;
};

async function notifyAdminRecurringGenerated(
  asOfKey: string,
  details: GenDetail[]
) {
  const created = details.filter((d) => d.quoteId && !d.error);
  if (!created.length) return { notified: false, reason: "none" };
  if (!isSmtpConfigured()) return { notified: false, reason: "smtp" };

  const settings = await prisma.companySettings.findFirst();
  let to = settings?.email?.trim() || "";
  if (!to) {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    to = user?.email?.trim() || "";
  }
  if (!to) return { notified: false, reason: "no-admin-email" };

  const base = appBaseUrl();
  const lines = created
    .map((d) => {
      const total = d.total != null ? formatCurrency(d.total) : "—";
      const link = d.quoteId ? `${base}/quotes/${d.quoteId}` : "";
      return [
        `• ${d.fullNumber ?? "—"} — ${d.clientName ?? "Cliente"} — ${total}`,
        `  Plantilla: ${d.name}`,
        d.clientEmail ? `  Email cliente: ${d.clientEmail}` : null,
        link ? `  Abrir proforma: ${link}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const subject =
    created.length === 1
      ? `Vexo: proforma periódica generada (${created[0].fullNumber})`
      : `Vexo: ${created.length} proformas periódicas generadas`;

  const text = [
    `Se han generado ${created.length} proforma(s) periódica(s) el ${asOfKey}.`,
    "",
    "No son facturas fiscales. Revísalas, envíalas al cliente y, cuando toque,",
    "conviértelas en factura desde el detalle de la proforma.",
    "",
    lines,
    "",
    `Proformas: ${base}/quotes`,
    `Periódicas: ${base}/recurring`,
  ].join("\n");

  await sendMail({ to, subject, text });
  return { notified: true, to, count: created.length };
}

/**
 * Genera como máximo UNA proforma por plantilla y ejecución.
 * No crea factura fiscal ni sello Veri*Factu: eso ocurre al convertir.
 *
 * Query opcional: ?date=2026-06-01 para simular el día de ejecución.
 */
async function runGeneration(asOf: Date) {
  const log = await prisma.cronRunLog.create({
    data: { success: false },
  });

  const asOfKey = dayKey(asOf);
  const details: GenDetail[] = [];

  let invoicesCreated = 0; // contador histórico del log (= proformas generadas)
  let adminNotify: {
    notified: boolean;
    reason?: string;
    to?: string;
    count?: number;
  } = { notified: false };

  try {
    const candidates = await prisma.recurringInvoiceTemplate.findMany({
      where: {
        status: "ACTIVA",
        nextRunDate: { not: null },
      },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        client: { select: { name: true, email: true } },
      },
    });

    const templates = candidates.filter((tpl) => {
      if (!tpl.nextRunDate) return false;
      if (dayKey(tpl.nextRunDate) > asOfKey) return false;
      if (tpl.endDate && dayKey(tpl.endDate) < asOfKey) return false;
      return true;
    });

    for (const tpl of templates) {
      try {
        const forceZeroVat = isZeroVatOperation(tpl.vatOperationType);

        const lineInputs = tpl.lines.map((l) => ({
          description: l.description,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          vatRate: forceZeroVat ? 0 : l.vatRate,
          discountPct: l.discountPct,
        }));
        // Proforma: sin IRPF en el documento (se aplica al convertir a factura)
        const totals = calculateDocument(lineInputs, 0);
        const issueDate = localNoonFromKey(dayKey(tpl.nextRunDate!));
        const validUntil = new Date(issueDate);
        validUntil.setDate(validUntil.getDate() + 30);

        const num = await allocateQuoteNumber(prisma);

        const noteParts = [
          tpl.notes?.trim() || null,
          `Generada automáticamente desde periódica «${tpl.name}»`,
          tpl.paymentMethod?.trim()
            ? `Forma de pago prevista: ${tpl.paymentMethod.trim()}`
            : null,
        ].filter(Boolean);

        const quote = await prisma.quote.create({
          data: {
            seriesId: num.seriesId,
            seriesPrefix: num.seriesPrefix,
            number: num.number,
            fullNumber: num.fullNumber,
            clientId: tpl.clientId,
            issueDate,
            validUntil,
            status: "BORRADOR",
            isProforma: true,
            notes: noteParts.join(" · ") || null,
            subtotal: totals.subtotal,
            vatAmount: totals.vatAmount,
            total: totals.total,
            recurringTemplateId: tpl.id,
          },
        });

        for (const l of totals.lines) {
          await prisma.quoteLine.create({
            data: {
              quoteId: quote.id,
              sortOrder: l.sortOrder,
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              vatRate: l.vatRate,
              discountPct: l.discountPct,
              lineSubtotal: l.lineSubtotal,
              lineVat: l.lineVat,
              lineTotal: l.lineTotal,
            },
          });
        }

        const nextRun = advanceDate(
          issueDate,
          tpl.frequency as Frequency,
          tpl.dayOfMonth,
          tpl.intervalCount
        );
        let status = tpl.status;
        if (tpl.endDate && dayKey(nextRun) > dayKey(tpl.endDate)) {
          status = "FINALIZADA";
        }

        await prisma.recurringInvoiceTemplate.update({
          where: { id: tpl.id },
          data: {
            lastRunAt: new Date(),
            nextRunDate: status === "FINALIZADA" ? null : nextRun,
            status,
          },
        });

        invoicesCreated++;
        details.push({
          templateId: tpl.id,
          name: tpl.name,
          clientName: tpl.client.name,
          clientEmail: tpl.client.email,
          quoteId: quote.id,
          fullNumber: quote.fullNumber,
          subtotal: Number(quote.subtotal),
          vatAmount: Number(quote.vatAmount),
          total: Number(quote.total),
        });
      } catch (err) {
        details.push({
          templateId: tpl.id,
          name: tpl.name,
          clientName: tpl.client.name,
          clientEmail: tpl.client.email,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (invoicesCreated > 0) {
      try {
        adminNotify = await notifyAdminRecurringGenerated(asOfKey, details);
      } catch (err) {
        adminNotify = {
          notified: false,
          reason: err instanceof Error ? err.message : String(err),
        };
      }
    }

    await prisma.cronRunLog.update({
      where: { id: log.id },
      data: {
        finishedAt: new Date(),
        success: true,
        templatesChecked: templates.length,
        invoicesCreated,
        details: JSON.stringify({ items: details, adminNotify }),
      },
    });

    return {
      ok: true,
      asOf: asOfKey,
      templatesChecked: templates.length,
      proformasCreated: invoicesCreated,
      invoicesCreated, // alias retrocompatible
      details,
      adminNotify,
      logId: log.id,
    };
  } catch (err) {
    await prisma.cronRunLog.update({
      where: { id: log.id },
      data: {
        finishedAt: new Date(),
        success: false,
        error: err instanceof Error ? err.message : String(err),
        details: JSON.stringify(details),
      },
    });
    throw err;
  }
}

function authorize(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

function resolveAsOf(req: NextRequest): Date {
  const raw = req.nextUrl.searchParams.get("date");
  if (!raw) return new Date();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      12,
      0,
      0,
      0
    );
  }
  const parsed = parseISO(raw);
  if (!isValid(parsed)) return new Date();
  return parsed;
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runGeneration(resolveAsOf(req));
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
