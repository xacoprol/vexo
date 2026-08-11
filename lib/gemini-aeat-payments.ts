/**
 * OCR del listado AEAT «Pagos realizados por un obligado tributario».
 */
import {
  geminiConfigured,
  generateJsonWithFallback,
  getGeminiApiKey,
  resolveUploadMime,
} from "@/lib/gemini-client";

export type ParsedAeatPayment = {
  modelType: string | null;
  year: number | null;
  quarter: number | null;
  amount: number;
  paidAt: string | null;
  nrc: string | null;
  concept: string | null;
};

export type ParsedAeatPaymentsDraft = {
  payments: ParsedAeatPayment[];
  notes: string | null;
  confidence: "high" | "medium" | "low";
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function normalizeModel(raw: unknown): string | null {
  const s = String(raw ?? "")
    .toUpperCase()
    .replace(/[^0-9]/g, "");
  if (["303", "130", "390", "347", "349", "100", "111", "115", "123"].includes(s)) {
    return s;
  }
  const labeled = String(raw ?? "").toUpperCase();
  if (labeled.includes("303")) return "303";
  if (labeled.includes("130")) return "130";
  if (labeled.includes("390")) return "390";
  if (labeled.includes("347")) return "347";
  if (labeled.includes("349")) return "349";
  if (labeled.includes("100") || labeled.includes("RENTA")) return "100";
  return s || null;
}

function parsePayments(raw: unknown): ParsedAeatPayment[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedAeatPayment[] = [];
  for (const item of raw) {
    const o = item as Record<string, unknown>;
    const amount = round2(Number(o.amount) || 0);
    if (amount <= 0) continue;
    const yearRaw = parseInt(String(o.year ?? ""), 10);
    const year =
      Number.isFinite(yearRaw) && yearRaw >= 2000 && yearRaw <= 2100
        ? yearRaw
        : null;
    const qRaw = parseInt(String(o.quarter ?? ""), 10);
    const quarter =
      qRaw === 1 || qRaw === 2 || qRaw === 3 || qRaw === 4 ? qRaw : null;
    const paidAt = String(o.paidAt ?? "").trim() || null;
    const nrc = String(o.nrc ?? "").trim() || null;
    out.push({
      modelType: normalizeModel(o.modelType ?? o.modelo ?? o.concept),
      year,
      quarter,
      amount,
      paidAt: paidAt && /^\d{4}-\d{2}-\d{2}$/.test(paidAt) ? paidAt : null,
      nrc,
      concept: String(o.concept ?? o.description ?? "").trim() || null,
    });
  }
  return out;
}

function parseDraft(text: string): ParsedAeatPaymentsDraft {
  if (!text.trim()) {
    throw new Error("Gemini no devolvió datos del listado de pagos");
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("No se pudo interpretar la respuesta de Gemini");
    parsed = JSON.parse(m[0]) as Record<string, unknown>;
  }
  const confidenceRaw = String(parsed.confidence ?? "medium").toLowerCase();
  const confidence =
    confidenceRaw === "high" || confidenceRaw === "low"
      ? confidenceRaw
      : "medium";
  return {
    payments: parsePayments(parsed.payments),
    notes: String(parsed.notes ?? "").trim() || null,
    confidence,
  };
}

export { geminiConfigured };

export async function parseAeatPaymentsDocument(file: {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}): Promise<ParsedAeatPaymentsDraft> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("Falta GEMINI_API_KEY");
  }
  const mime = resolveUploadMime(file.mimeType, file.fileName);
  const base64 = file.buffer.toString("base64");

  const prompt = `Eres un asistente fiscal español. El documento es un listado de la AEAT tipo «Pagos realizados por un obligado tributario» (o justificantess NRC / adeudos).

Devuelve SOLO un JSON válido:
{
  "payments": [
    {
      "modelType": "303" | "130" | "390" | "100" | otro código o null,
      "year": 2025,
      "quarter": 1,
      "amount": 123.45,
      "paidAt": "YYYY-MM-DD",
      "nrc": "código NRC si aparece",
      "concept": "texto corto del concepto"
    }
  ],
  "notes": "dudas o null",
  "confidence": "high" | "medium" | "low"
}

Reglas:
- Extrae CADA pago con importe > 0.
- year/quarter: del periodo liquidado (ej. 2T 2025 → year 2025, quarter 2). Anuales → quarter null.
- modelType: del concepto (IVA→303, pagos fraccionados IRPF→130, renta→100…).
- amount en euros con punto decimal.
- nrc: número de referencia completo si aparece; si no, null.
- paidAt: fecha de pago/adeudo; null si no se lee.
- No inventes filas. Archivo: ${file.fileName}`;

  const text = await generateJsonWithFallback({
    apiKey,
    mime,
    base64,
    prompt,
  });
  return parseDraft(text);
}
