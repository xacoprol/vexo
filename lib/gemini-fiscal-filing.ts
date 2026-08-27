/**
 * OCR de modelos fiscales presentados (303 / 130 / 390) vía Gemini.
 */
import { geminiConfigured } from "@/lib/gemini-expense";

export type FiscalModelType =
  | "303"
  | "130"
  | "390"
  | "347"
  | "349"
  | "036"
  | "111"
  | "115"
  | "180"
  | "190";

export const FISCAL_MODEL_TYPES: FiscalModelType[] = [
  "303",
  "130",
  "390",
  "347",
  "349",
  "036",
  "111",
  "115",
  "180",
  "190",
];

/** Modelos anuales o censales (sin trimestre). */
export function isAnnualOrCensusModel(modelType: FiscalModelType): boolean {
  return (
    modelType === "390" ||
    modelType === "347" ||
    modelType === "036" ||
    modelType === "180" ||
    modelType === "190"
  );
}

export type FilingBox = {
  code: string;
  label: string;
  value: number;
};

export type ParsedFiscalFilingDraft = {
  modelType: FiscalModelType;
  year: number;
  quarter: number | null;
  filedAt: string | null; // YYYY-MM-DD
  result: number;
  /** Base ingresos computables (130 casilla 01; 390/303 bases sujetas si aplica) */
  incomeBase: number | null;
  /** Base gastos deducibles (130 casilla 02) */
  expensesBase: number | null;
  /** IVA repercutido / devengado */
  vatRepercutida: number | null;
  /** IVA soportado deducible */
  vatDeductible: number | null;
  boxes: FilingBox[];
  notes: string | null;
  confidence: "high" | "medium" | "low";
  /** Respuesta cruda normalizada para auditoría */
  rawExtract: Record<string, unknown>;
};

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_BYTES = 12 * 1024 * 1024;

const DEFAULT_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
];

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function getGeminiApiKey(): string | null {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    null
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function rankModelName(name: string): number {
  const n = name.toLowerCase();
  if (n.includes("flash-lite")) return 0;
  if (n.includes("flash") && !n.includes("pro")) return 1;
  if (n.includes("pro")) return 3;
  return 2;
}

async function listGenerateContentModels(apiKey: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=${encodeURIComponent(apiKey)}`
    );
    if (!res.ok) return [];
    const json = (await res.json()) as {
      models?: Array<{
        name?: string;
        supportedGenerationMethods?: string[];
      }>;
    };
    const names = (json.models ?? [])
      .filter((m) =>
        (m.supportedGenerationMethods ?? []).includes("generateContent")
      )
      .map((m) => (m.name ?? "").replace(/^models\//, ""))
      .filter((n) => n && !n.includes("embed") && !n.includes("imagen"));
    names.sort(
      (a, b) => rankModelName(a) - rankModelName(b) || a.localeCompare(b)
    );
    return names;
  } catch {
    return [];
  }
}

async function getModelCandidates(apiKey: string): Promise<string[]> {
  const preferred = process.env.GEMINI_MODEL?.trim();
  const listed = await listGenerateContentModels(apiKey);
  const base = listed.length ? listed : DEFAULT_MODELS;
  const list = preferred
    ? [preferred, ...base.filter((m) => m !== preferred)]
    : [...base];
  return [...new Set(list)].slice(0, 6);
}

type GeminiHttpResult =
  | { ok: true; text: string }
  | { ok: false; status: number; body: string };

async function callGemini(opts: {
  apiKey: string;
  model: string;
  mime: string;
  base64: string;
  prompt: string;
}): Promise<GeminiHttpResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: opts.prompt },
            {
              inline_data: {
                mime_type: opts.mime,
                data: opts.base64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, status: res.status, body };
  }

  const json = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const text =
    json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ??
    "";
  return { ok: true, text };
}

export function fiscalFilingPeriodKey(
  modelType: FiscalModelType,
  year: number,
  quarter: number | null
): string {
  if (isAnnualOrCensusModel(modelType) || quarter == null) {
    return `${modelType}:${year}`;
  }
  return `${modelType}:${year}:${quarter}`;
}

export { geminiConfigured };

function normalizeModelType(raw: unknown): FiscalModelType {
  const s = String(raw ?? "")
    .toUpperCase()
    .replace(/[^\d]/g, "");
  if (s === "130") return "130";
  if (s === "390") return "390";
  if (s === "347") return "347";
  if (s === "349") return "349";
  if (s === "036" || s === "36") return "036";
  if (s === "303") return "303";
  const labeled = String(raw ?? "").toUpperCase();
  if (labeled.includes("347")) return "347";
  if (labeled.includes("349")) return "349";
  if (labeled.includes("036") || labeled.includes("037")) return "036";
  if (labeled.includes("390")) return "390";
  if (labeled.includes("130")) return "130";
  return "303";
}

function normalizeDate(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

function parseBoxes(raw: unknown): FilingBox[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((b) => {
      const o = b as Record<string, unknown>;
      return {
        code: String(o.code ?? "—").trim() || "—",
        label: String(o.label ?? "").trim() || "Casilla",
        value: round2(Number(o.value) || 0),
      };
    })
    .filter((b) => b.label);
}

function optionalAmount(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return round2(n);
}

function parseDraftFromText(text: string): ParsedFiscalFilingDraft {
  if (!text.trim()) {
    throw new Error("Gemini no devolvió datos. Prueba con otro PDF/imagen.");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("No se pudo interpretar la respuesta de Gemini");
    parsed = JSON.parse(m[0]) as Record<string, unknown>;
  }

  const modelType = normalizeModelType(parsed.modelType);
  const yearRaw = parseInt(String(parsed.year ?? ""), 10);
  const year =
    Number.isFinite(yearRaw) && yearRaw >= 2000 && yearRaw <= 2100
      ? yearRaw
      : new Date().getFullYear();

  let quarter: number | null = null;
  if (!isAnnualOrCensusModel(modelType)) {
    const q = parseInt(String(parsed.quarter ?? ""), 10);
    quarter = q === 1 || q === 2 || q === 3 || q === 4 ? q : 1;
  }

  const boxes = parseBoxes(parsed.boxes);
  let result = round2(Number(parsed.result) || 0);
  if (!result && boxes.length) {
    const last = boxes[boxes.length - 1];
    result = last.value;
  }

  const confidenceRaw = String(parsed.confidence ?? "medium").toLowerCase();
  const confidence =
    confidenceRaw === "high" || confidenceRaw === "low"
      ? confidenceRaw
      : "medium";

  return {
    modelType,
    year,
    quarter,
    filedAt: normalizeDate(parsed.filedAt),
    result,
    incomeBase: optionalAmount(parsed.incomeBase),
    expensesBase: optionalAmount(parsed.expensesBase),
    vatRepercutida: optionalAmount(parsed.vatRepercutida),
    vatDeductible: optionalAmount(parsed.vatDeductible),
    boxes,
    notes: String(parsed.notes ?? "").trim() || null,
    confidence,
    rawExtract: parsed,
  };
}

export async function parseFiscalFilingDocument(file: {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}): Promise<ParsedFiscalFilingDraft> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "Falta GEMINI_API_KEY (o GOOGLE_API_KEY) en las variables de entorno"
    );
  }

  const mime = file.mimeType.split(";")[0].trim().toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    throw new Error("Formato no soportado. Usa PDF, JPG, PNG o WebP");
  }
  if (file.buffer.byteLength > MAX_BYTES) {
    throw new Error("El archivo supera 12 MB");
  }

  const prompt = `Eres un asistente fiscal español. El documento es un modelo tributario YA PRESENTADO (AEAT / gestoría): Modelo 303 (IVA trimestral), 130 (IRPF fraccionado), 390 (resumen anual IVA), 347 (operaciones con terceros), 349 (operaciones intracomunitarias) o 036/037 (censo).

Devuelve SOLO un JSON válido:
{
  "modelType": "303" | "130" | "390" | "347" | "349" | "036",
  "year": 2026,
  "quarter": 1,
  "filedAt": "YYYY-MM-DD" o null,
  "result": 0,
  "incomeBase": 0,
  "expensesBase": 0,
  "vatRepercutida": 0,
  "vatDeductible": 0,
  "boxes": [
    { "code": "45", "label": "descripción corta", "value": 0 }
  ],
  "notes": "dudas o null",
  "confidence": "high" | "medium" | "low"
}

Reglas:
- modelType: detecta por título/cabecera. Resumen anual IVA → 390. Operaciones con terceros → 347. Intracomunitarias → 349. Censal alta/modificación → 036.
- year: ejercicio fiscal del modelo (no el año de presentación si difiere).
- quarter: solo para 303, 130 y 349 (1–4). Para 390, 347 y 036 usa null.
- result: importe a ingresar / resultado. Número; negativo si a compensar/devolver. En 347/349/036 puede ser 0.
- incomeBase / expensesBase / vatRepercutida / vatDeductible: como en 303/130/390; null si no aplica.
- Usa null si el dato no aparece (no inventes).
- boxes: casillas numéricas relevantes. Importes en euros con punto decimal.
- Para modelo 303 incluye SIEMPRE (si aparecen): 01–09 (bases/cuotas), 10–11 (AIB), 27 (IVA devengado), 28–29 (soportado), 36–37 (AIB deducible), 45, 46, 66/69 (resultado), 78, 87, 110 (compensaciones). Mínimo 8 casillas si el PDF es un 303 completo.
- Para modelo 130 incluye: 01–07 (ingresos, gastos, rendimiento, 20%, pagos previos, retenciones, resultado).
- filedAt: fecha de presentación si aparece; si no, null.
- Archivo de referencia: ${file.fileName}`;

  const base64 = file.buffer.toString("base64");
  const models = await getModelCandidates(apiKey);
  let last429 = false;
  let last404 = false;
  let lastError = "";

  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await sleep(1500 * attempt);
      const result = await callGemini({
        apiKey,
        model,
        mime,
        base64,
        prompt,
      });

      if (result.ok) {
        return parseDraftFromText(result.text);
      }

      lastError = result.body.slice(0, 200);
      if (result.status === 429) {
        last429 = true;
        continue;
      }
      if (result.status === 404) {
        last404 = true;
        break;
      }
      if (result.status === 400 || result.status === 403) {
        throw new Error(
          `Gemini rechazó la petición (${result.status}). Revisa la API key${lastError ? `: ${lastError}` : "."}`
        );
      }
      throw new Error(
        `Error Gemini ${result.status}${lastError ? `: ${lastError}` : ""}`
      );
    }
  }

  if (last429) {
    throw new Error(
      "Límite de Gemini agotado. Espera un minuto o activa facturación en Google AI Studio."
    );
  }
  if (last404) {
    throw new Error(
      "Ningún modelo Gemini disponible. Define GEMINI_MODEL en el entorno."
    );
  }
  throw new Error(
    `No se pudo usar Gemini${lastError ? `: ${lastError}` : "."}`
  );
}
