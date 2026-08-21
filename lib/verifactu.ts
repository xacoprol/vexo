/**
 * Veri*Factu (RRSIF):
 * - Huella SHA-256 encadenada (especificación AEAT)
 * - QR tributario (no verificable o verificable tras remisión)
 *
 * Fuentes:
 * - Especificaciones huella/hash registros
 * - ValidarQRNoVerifactu / ValidarQR
 */

import { createHash } from "crypto";

export type VerifactuMode = "NO_VERIFACTU" | "VERIFACTU";
export type VerifactuEnv = "TEST" | "PROD";

export const VERIFACTU_MODE_DEFAULT: VerifactuMode = "NO_VERIFACTU";

/** Producción — facturas no verificables (sin remisión en línea). */
export const VERIFACTU_QR_BASE_NO =
  "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu";

/** QR verificable tras remisión aceptada. */
export const VERIFACTU_QR_BASE_YES =
  "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR";

export function parseVerifactuMode(raw: unknown): VerifactuMode {
  const v = String(raw ?? "").trim().toUpperCase();
  return v === "VERIFACTU" ? "VERIFACTU" : "NO_VERIFACTU";
}

export function parseVerifactuEnv(raw: unknown): VerifactuEnv {
  const v = String(raw ?? "").trim().toUpperCase();
  return v === "PROD" ? "PROD" : "TEST";
}

export type VerifactuAltaFields = {
  idEmisorFactura: string;
  numSerieFactura: string;
  fechaExpedicionFactura: string; // DD-MM-AAAA
  tipoFactura?: string; // F1 por defecto
  cuotaTotal: string;
  importeTotal: string;
  /** Huella del registro anterior (vacío si es el primero). */
  huellaAnterior: string;
  fechaHoraHusoGenRegistro: string; // ISO con offset
};

export type VerifactuAnulacionFields = {
  idEmisorFactura: string;
  numSerieFactura: string;
  fechaExpedicionFactura: string;
  /** Huella del registro de alta que se anula (o cadena previa). */
  huellaAnterior: string;
  fechaHoraHusoGenRegistro: string;
};

export function normalizeIssuerNif(raw: string): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[\s.\-]/g, "")
    .trim();
}

/** Importe para huella: siempre 2 decimales con punto. */
export function formatVerifactuAmount(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return (Math.round((v + Number.EPSILON) * 100) / 100).toFixed(2);
}

/** Importe para QR: punto decimal, sin ceros finales innecesarios. */
export function formatQrAmount(n: number): string {
  const v = Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  return String(v);
}

export function formatFechaExpedicion(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  return `${day}-${month}-${year}`;
}

/**
 * FechaHoraHusoGenRegistro en Europe/Madrid con offset numérico (+01:00 / +02:00).
 */
export function formatFechaHoraHusoGenRegistro(date = new Date()): string {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const y = get("year");
  const mo = get("month");
  const d = get("day");
  const h = get("hour");
  const mi = get("minute");
  const s = get("second");
  const local = `${y}-${mo}-${d}T${h}:${mi}:${s}`;

  const guessUtc = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s)
  );
  const diffMin = Math.round((guessUtc - date.getTime()) / 60000);
  const sign = diffMin >= 0 ? "+" : "-";
  const abs = Math.abs(diffMin);
  const oh = String(Math.floor(abs / 60)).padStart(2, "0");
  const om = String(abs % 60).padStart(2, "0");
  return `${local}${sign}${oh}:${om}`;
}

function trimValue(v: string): string {
  return String(v ?? "").trim();
}

/**
 * TipoFactura AEAT a partir del tipo de operación IVA de Vexo.
 * F1 = completa; F2 = simplificada (B2C marketplace típico).
 */
export function tipoFacturaFromVatOperation(
  vatOperationType: string | null | undefined,
  opts?: { simplified?: boolean }
): string {
  if (opts?.simplified) return "F2";
  const op = String(vatOperationType ?? "SUJETA").toUpperCase();
  if (op === "INTRACOMUNITARIA" || op === "EXPORTACION" || op === "CANARIAS") {
    return "F1";
  }
  return "F1";
}

/** Cadena canónica AEAT para registro de alta. */
export function buildHuellaAltaCanonical(fields: VerifactuAltaFields): string {
  const pairs: [string, string][] = [
    ["IDEmisorFactura", trimValue(fields.idEmisorFactura)],
    ["NumSerieFactura", trimValue(fields.numSerieFactura)],
    ["FechaExpedicionFactura", trimValue(fields.fechaExpedicionFactura)],
    ["TipoFactura", trimValue(fields.tipoFactura || "F1")],
    ["CuotaTotal", trimValue(fields.cuotaTotal)],
    ["ImporteTotal", trimValue(fields.importeTotal)],
    ["Huella", trimValue(fields.huellaAnterior)],
    ["FechaHoraHusoGenRegistro", trimValue(fields.fechaHoraHusoGenRegistro)],
  ];
  return pairs.map(([k, v]) => `${k}=${v}`).join("&");
}

/** Cadena canónica para anulación (registro de evento local + cola AEAT). */
export function buildHuellaAnulacionCanonical(
  fields: VerifactuAnulacionFields
): string {
  const pairs: [string, string][] = [
    ["IDEmisorFactura", trimValue(fields.idEmisorFactura)],
    ["NumSerieFactura", trimValue(fields.numSerieFactura)],
    ["FechaExpedicionFactura", trimValue(fields.fechaExpedicionFactura)],
    ["TipoFactura", "Anulacion"],
    ["Huella", trimValue(fields.huellaAnterior)],
    ["FechaHoraHusoGenRegistro", trimValue(fields.fechaHoraHusoGenRegistro)],
  ];
  return pairs.map(([k, v]) => `${k}=${v}`).join("&");
}

export function sha256HexUpper(canonical: string): string {
  return createHash("sha256")
    .update(canonical, "utf8")
    .digest("hex")
    .toUpperCase();
}

export function computeHuellaAlta(fields: VerifactuAltaFields): {
  canonical: string;
  huella: string;
} {
  const canonical = buildHuellaAltaCanonical(fields);
  return { canonical, huella: sha256HexUpper(canonical) };
}

export function computeHuellaAnulacion(fields: VerifactuAnulacionFields): {
  canonical: string;
  huella: string;
} {
  const canonical = buildHuellaAnulacionCanonical(fields);
  return { canonical, huella: sha256HexUpper(canonical) };
}

export function buildVerifactuQrUrl(opts: {
  nif: string;
  numSerie: string;
  fechaExpedicion: string; // DD-MM-AAAA
  importeTotal: number;
  /** true = QR verificable (solo tras remisión aceptada) */
  verificable?: boolean;
  baseUrl?: string;
}): string {
  const base =
    opts.baseUrl ??
    (opts.verificable ? VERIFACTU_QR_BASE_YES : VERIFACTU_QR_BASE_NO);
  const params = new URLSearchParams();
  params.set("nif", normalizeIssuerNif(opts.nif));
  params.set("numserie", opts.numSerie.slice(0, 60));
  params.set("fecha", opts.fechaExpedicion);
  params.set("importe", formatQrAmount(opts.importeTotal));
  return `${base}?${params.toString()}`;
}

export type SealInput = {
  issuerNif: string;
  fullNumber: string;
  issueDate: Date;
  vatAmount: number;
  total: number;
  previousHash: string | null;
  recordAt?: Date;
  tipoFactura?: string;
  /** QR verificable (tras remisión) */
  verificable?: boolean;
};

export type SealResult = {
  hash: string;
  previousHash: string;
  recordAt: Date;
  recordAtIso: string;
  qrUrl: string;
  canonical: string;
  tipoFactura: string;
};

export function sealVerifactuRecord(input: SealInput): SealResult {
  const recordAt = input.recordAt ?? new Date();
  const recordAtIso = formatFechaHoraHusoGenRegistro(recordAt);
  const fechaExp = formatFechaExpedicion(input.issueDate);
  const previousHash = (input.previousHash ?? "").trim();
  const tipoFactura = input.tipoFactura || "F1";
  const fields: VerifactuAltaFields = {
    idEmisorFactura: normalizeIssuerNif(input.issuerNif),
    numSerieFactura: input.fullNumber.trim(),
    fechaExpedicionFactura: fechaExp,
    tipoFactura,
    cuotaTotal: formatVerifactuAmount(input.vatAmount),
    importeTotal: formatVerifactuAmount(input.total),
    huellaAnterior: previousHash,
    fechaHoraHusoGenRegistro: recordAtIso,
  };
  const { canonical, huella } = computeHuellaAlta(fields);
  const qrUrl = buildVerifactuQrUrl({
    nif: fields.idEmisorFactura,
    numSerie: fields.numSerieFactura,
    fechaExpedicion: fechaExp,
    importeTotal: input.total,
    verificable: Boolean(input.verificable),
  });
  return {
    hash: huella,
    previousHash,
    recordAt,
    recordAtIso,
    qrUrl,
    canonical,
    tipoFactura,
  };
}

export type VerifactuInvoiceStatus =
  | "sin_sello"
  | "sellada"
  | "pendiente_remision"
  | "remitida"
  | "rechazada"
  | "anulada";

export function resolveVerifactuInvoiceStatus(opts: {
  status: string;
  verifactuHash: string | null;
  verifactuSentAt: Date | null;
  pendingEvent?: boolean;
  rejectedEvent?: boolean;
}): VerifactuInvoiceStatus {
  if (opts.status === "ANULADA") return "anulada";
  if (!opts.verifactuHash) return "sin_sello";
  if (opts.verifactuSentAt) return "remitida";
  if (opts.rejectedEvent) return "rechazada";
  if (opts.pendingEvent) return "pendiente_remision";
  return "sellada";
}

export const VERIFACTU_STATUS_LABEL: Record<VerifactuInvoiceStatus, string> = {
  sin_sello: "Sin sello",
  sellada: "Sellada (local)",
  pendiente_remision: "Pendiente remisión",
  remitida: "Remitida AEAT",
  rechazada: "Rechazada AEAT",
  anulada: "Anulada",
};
