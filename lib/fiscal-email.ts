/**
 * Plantillas HTML + texto para recordatorios fiscales.
 * Estilo email-safe (tablas + CSS inline).
 */

import type { FilingDeadline } from "@/lib/fiscal-calendar";
import { daysUntil, urgencyLabel } from "@/lib/fiscal-calendar";

const BRAND = {
  ink: "#1a1523",
  muted: "#6b6478",
  line: "#e6e1ef",
  soft: "#f6f3fb",
  accent: "#7B2CFE",
  accentHover: "#6518E0",
  warnBg: "#fff4e5",
  warnInk: "#9a5b00",
  dangerBg: "#fde8e8",
  dangerInk: "#b42318",
  okBg: "#e8f6ee",
  okInk: "#0f6b3a",
  white: "#ffffff",
};

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function btn(href: string, label: string, primary = true): string {
  const bg = primary ? BRAND.accent : BRAND.white;
  const color = primary ? BRAND.white : BRAND.ink;
  const border = primary ? BRAND.accent : BRAND.line;
  return `<a href="${esc(href)}" style="display:inline-block;padding:12px 18px;background:${bg};color:${color};border:1px solid ${border};border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;line-height:1.2;">${esc(label)}</a>`;
}

function badge(text: string, tone: "soon" | "due" | "ok" | "test"): string {
  const map = {
    soon: { bg: BRAND.warnBg, ink: BRAND.warnInk },
    due: { bg: BRAND.dangerBg, ink: BRAND.dangerInk },
    ok: { bg: BRAND.okBg, ink: BRAND.okInk },
    test: { bg: BRAND.soft, ink: BRAND.accent },
  } as const;
  const t = map[tone];
  return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${t.bg};color:${t.ink};font-size:12px;font-weight:600;letter-spacing:0.02em;">${esc(text)}</span>`;
}

function shell(opts: {
  baseUrl: string;
  preheader: string;
  title: string;
  badgeHtml: string;
  bodyHtml: string;
  footerNote?: string;
}): string {
  const pre = esc(opts.preheader);
  const logoSrc = `${opts.baseUrl.replace(/\/$/, "")}/brand/logo.png`;
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.soft};color:${BRAND.ink};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${pre}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.soft};padding:28px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:${BRAND.white};border:1px solid ${BRAND.line};border-radius:14px;overflow:hidden;">
        <tr>
          <td style="padding:22px 28px 10px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;">
                  <a href="${esc(opts.baseUrl)}" style="text-decoration:none;">
                    <img src="${esc(logoSrc)}" alt="Vexo" width="180" height="30" style="display:block;width:180px;height:30px;border:0;outline:none;text-decoration:none;" />
                  </a>
                </td>
                <td align="right" style="vertical-align:middle;">${opts.badgeHtml}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 28px 8px 28px;">
            <div style="height:1px;background:${BRAND.line};line-height:1px;font-size:1px;">&nbsp;</div>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 28px 28px 28px;">
            ${opts.bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px 22px 28px;background:${BRAND.soft};border-top:1px solid ${BRAND.line};">
            <p style="margin:0;font-size:12px;line-height:1.5;color:${BRAND.muted};">
              ${esc(opts.footerNote ?? "Recordatorio automático de Vexo. No responde a este correo.")}
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function metaRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;font-size:13px;color:${BRAND.muted};width:112px;vertical-align:top;">${esc(label)}</td>
    <td style="padding:8px 0;font-size:15px;font-weight:600;color:${BRAND.ink};">${esc(value)}</td>
  </tr>`;
}

function step(n: number, title: string, detail?: string): string {
  return `<tr>
    <td style="padding:0 0 12px 0;vertical-align:top;width:28px;">
      <div style="width:22px;height:22px;border-radius:50%;background:${BRAND.soft};color:${BRAND.accent};font-size:12px;font-weight:700;text-align:center;line-height:22px;">${n}</div>
    </td>
    <td style="padding:0 0 12px 8px;vertical-align:top;">
      <div style="font-size:14px;font-weight:600;color:${BRAND.ink};">${esc(title)}</div>
      ${detail ? `<div style="margin-top:2px;font-size:13px;color:${BRAND.muted};line-height:1.4;">${detail}</div>` : ""}
    </td>
  </tr>`;
}

export type ReminderKind = "14d" | "3d" | "due";

export function reminderKindLabel(kind: ReminderKind): string {
  if (kind === "14d") return "Faltan 14 días";
  if (kind === "3d") return "Faltan 3 días";
  return "Vence hoy";
}

function urgencyTone(kind: ReminderKind): "soon" | "due" | "ok" {
  if (kind === "due") return "due";
  if (kind === "3d") return "soon";
  return "ok";
}

export function buildFiscalDeadlineEmail(opts: {
  deadline: FilingDeadline;
  kind: ReminderKind;
  baseUrl: string;
}): { subject: string; text: string; html: string } {
  const { deadline: d, kind, baseUrl } = opts;
  const status = reminderKindLabel(kind);
  const subject = `[Vexo] Modelo ${d.model} ${d.periodLabel} — ${status.toLowerCase()}`;
  const guideUrl = `${baseUrl}/fiscal/guide`;
  const filingsUrl = `${baseUrl}/fiscal/filings`;
  const draftUrl = `${baseUrl}${d.href}`;

  const text = [
    `Hola,`,
    ``,
    `Recordatorio fiscal de Vexo`,
    ``,
    `Modelo ${d.model} · ${d.periodLabel}`,
    `Plazo: ${d.dueLabel}`,
    `Estado: ${status}`,
    ``,
    d.what,
    ``,
    `Pasos:`,
    `1) Revisa gastos e ingresos del periodo`,
    `2) Abre la guía y copia las casillas: ${guideUrl}`,
    `3) Presenta en la sede AEAT: ${d.aeatPath}`,
    `4) Sube el PDF a Presentados: ${filingsUrl}`,
    ``,
    `Borrador: ${draftUrl}`,
    ``,
    `— Vexo`,
  ].join("\n");

  const bodyHtml = `
    <h1 style="margin:0 0 6px 0;font-size:22px;line-height:1.25;letter-spacing:-0.02em;color:${BRAND.ink};">
      Modelo ${esc(d.model)}
    </h1>
    <p style="margin:0 0 18px 0;font-size:15px;color:${BRAND.muted};">
      ${esc(d.periodLabel)} · plazo ${esc(d.dueLabel)}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.soft};border-radius:10px;margin:0 0 20px 0;">
      <tr>
        <td style="padding:14px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${metaRow("Estado", status)}
            ${metaRow("Modelo", d.model)}
            ${metaRow("Periodo", d.periodLabel)}
            ${metaRow("Plazo", d.dueLabel)}
          </table>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 20px 0;font-size:14px;line-height:1.55;color:${BRAND.ink};">
      ${esc(d.what)}
    </p>
    <p style="margin:0 0 10px 0;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${BRAND.muted};">
      Qué hacer
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px 0;">
      ${step(1, "Revisa gastos e ingresos del periodo")}
      ${step(2, "Abre la guía y copia las casillas")}
      ${step(3, "Presenta en la sede AEAT")}
      ${step(4, "Sube el PDF a Presentados en Vexo")}
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:0 8px 8px 0;">${btn(draftUrl, `Abrir borrador ${d.model}`)}</td>
        <td style="padding:0 0 8px 0;">${btn(guideUrl, "Ver guía", false)}</td>
      </tr>
    </table>
    <p style="margin:14px 0 0 0;font-size:12px;color:${BRAND.muted};">
      Sede AEAT: <a href="${esc(d.aeatPath)}" style="color:${BRAND.accent};">${esc(d.aeatPath)}</a>
      · Presentados: <a href="${esc(filingsUrl)}" style="color:${BRAND.accent};">${esc(filingsUrl)}</a>
    </p>
  `;

  const html = shell({
    baseUrl,
    preheader: `${status}: modelo ${d.model} ${d.periodLabel} · ${d.dueLabel}`,
    title: subject,
    badgeHtml: badge(status, urgencyTone(kind)),
    bodyHtml,
  });

  return { subject, text, html };
}

export function buildAeatCommsEmail(opts: {
  kind: ReminderKind;
  subjectLabel: string;
  aeatKind: string;
  dueLabel: string;
  baseUrl: string;
}): { subject: string; text: string; html: string } {
  const status = reminderKindLabel(opts.kind);
  const subject = `[Vexo] AEAT ${opts.aeatKind}: ${opts.subjectLabel} — ${status.toLowerCase()}`;
  const aeatUrl = `${opts.baseUrl}/fiscal/aeat`;

  const text = [
    `Hola,`,
    ``,
    `Tienes una comunicación AEAT abierta con plazo.`,
    ``,
    `Asunto: ${opts.subjectLabel}`,
    `Tipo: ${opts.aeatKind}`,
    `Plazo: ${opts.dueLabel}`,
    `Estado: ${status}`,
    ``,
    `Revisa y responde en la sede (DEHú). Cuando acabes, márcalo en Vexo:`,
    aeatUrl,
    ``,
    `— Vexo`,
  ].join("\n");

  const bodyHtml = `
    <h1 style="margin:0 0 6px 0;font-size:22px;line-height:1.25;letter-spacing:-0.02em;color:${BRAND.ink};">
      Comunicación AEAT
    </h1>
    <p style="margin:0 0 18px 0;font-size:15px;color:${BRAND.muted};">
      ${esc(opts.aeatKind)} · plazo ${esc(opts.dueLabel)}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.soft};border-radius:10px;margin:0 0 20px 0;">
      <tr>
        <td style="padding:14px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${metaRow("Estado", status)}
            ${metaRow("Asunto", opts.subjectLabel)}
            ${metaRow("Tipo", opts.aeatKind)}
            ${metaRow("Plazo", opts.dueLabel)}
          </table>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 20px 0;font-size:14px;line-height:1.55;color:${BRAND.ink};">
      Revisa y responde en la sede (DEHú). Cuando acabes, márcalo como resuelto en Vexo.
    </p>
    ${btn(aeatUrl, "Abrir comunicaciones AEAT")}
  `;

  const html = shell({
    baseUrl: opts.baseUrl,
    preheader: `${status}: ${opts.aeatKind} · ${opts.subjectLabel}`,
    title: subject,
    badgeHtml: badge(status, urgencyTone(opts.kind)),
    bodyHtml,
  });

  return { subject, text, html };
}

export function buildFiscalTestEmail(opts: {
  deadlines: FilingDeadline[];
  baseUrl: string;
  now?: Date;
}): { subject: string; text: string; html: string } {
  const now = opts.now ?? new Date();
  const subject = "[Vexo] Prueba de recordatorios fiscales";
  const guideUrl = `${opts.baseUrl}/fiscal/guide`;
  const settingsUrl = `${opts.baseUrl}/settings`;

  const lines = opts.deadlines.map((d) => {
    const u = urgencyLabel(d.dueDate, now);
    const days = daysUntil(d.dueDate, now);
    return `· ${d.model} ${d.periodLabel} — ${d.dueLabel} (${u.text}, ${days} días)`;
  });

  const text = [
    `Hola,`,
    ``,
    `Esto es una prueba de los recordatorios fiscales de Vexo.`,
    `Si lo lees, el SMTP y el destino están bien.`,
    ``,
    `Los avisos reales salen 14 días antes, 3 días antes y el día del plazo.`,
    ``,
    `Próximos plazos:`,
    ...(lines.length ? lines : ["· (ninguno ahora)"]),
    ``,
    `Guía: ${guideUrl}`,
    `Ajustes: ${settingsUrl}`,
    ``,
    `— Vexo`,
  ].join("\n");

  const rows = opts.deadlines
    .map((d) => {
      const u = urgencyLabel(d.dueDate, now);
      const tone =
        u.kind === "overdue" || u.kind === "soon"
          ? u.kind === "overdue"
            ? "due"
            : "soon"
          : "ok";
      return `<tr>
        <td style="padding:12px 0;border-bottom:1px solid ${BRAND.line};">
          <div style="font-size:15px;font-weight:600;color:${BRAND.ink};">
            <a href="${esc(`${opts.baseUrl}${d.href}`)}" style="color:${BRAND.ink};text-decoration:none;">Modelo ${esc(d.model)} · ${esc(d.periodLabel)}</a>
          </div>
          <div style="margin-top:4px;font-size:13px;color:${BRAND.muted};">${esc(d.dueLabel)}</div>
        </td>
        <td align="right" style="padding:12px 0;border-bottom:1px solid ${BRAND.line};vertical-align:middle;">
          ${badge(u.text, tone)}
        </td>
      </tr>`;
    })
    .join("");

  const bodyHtml = `
    <h1 style="margin:0 0 6px 0;font-size:22px;line-height:1.25;letter-spacing:-0.02em;color:${BRAND.ink};">
      Prueba de recordatorios
    </h1>
    <p style="margin:0 0 18px 0;font-size:15px;line-height:1.5;color:${BRAND.muted};">
      Si lees esto, el SMTP y el email destino están bien. Los avisos reales salen 14 días antes, 3 días antes y el día del plazo.
    </p>
    <p style="margin:0 0 10px 0;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${BRAND.muted};">
      Próximos plazos
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px 0;">
      ${
        rows ||
        `<tr><td style="padding:12px 0;font-size:14px;color:${BRAND.muted};">Ningún plazo próximo ahora.</td></tr>`
      }
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:0 8px 8px 0;">${btn(guideUrl, "Abrir guía")}</td>
        <td style="padding:0 0 8px 0;">${btn(settingsUrl, "Ajustes", false)}</td>
      </tr>
    </table>
  `;

  const html = shell({
    baseUrl: opts.baseUrl,
    preheader: "Prueba OK: SMTP y destino de recordatorios fiscales",
    title: subject,
    badgeHtml: badge("Prueba", "test"),
    bodyHtml,
    footerNote: "Email de prueba. No afecta al historial de recordatorios.",
  });

  return { subject, text, html };
}
