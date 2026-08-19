import {
  EXPENSE_CATEGORIES,
  parseExpenseVatOperationType,
  isExpenseReverseCharge,
  type ExpenseVatOperationType,
} from "@/lib/fiscal";
import {
  geminiConfigured as geminiKeyConfigured,
  generateJsonWithFallback,
  getGeminiApiKey,
  resolveUploadMime,
} from "@/lib/gemini-client";

/** Perfil de actividad WOD3D para valorar si un gasto encaja. */
export const WOD3D_ACTIVITY_PROFILE = `WOD3D: autónomo en Actividad profesional.
Alta censal / CNAE: 3299 — Otras industrias manufactureras n.c.o.p.
Fabrica y vende (encaje natural con 3299):
- Impresión 3D (filamentos PLA/PETG/ABS, resina, impresoras, boquillas, piezas)
- Grabado láser (máquinas láser tipo xTool/Makeblock, lentes, materiales grabables, metacrilato, madera, acero)
- Joyería grabada a láser y llaveros personalizados en PLA
- Parches con velcro para mochilas / merchandising textil
- Utillaje, consumibles industriales, embalaje de producto, envíos, publicidad online
- Software, hosting, marketplace (Amazon/Shopify)
Bienes de inversión típicos: impresoras 3D, cortadoras/grabadoras láser, Mac/PC afectos, utillaje.
Trabaja desde casa (home office): suministros del hogar (luz, agua, internet, gas, comunidad) PUEDEN ser parcialmente deducibles (solo el % afecto a la actividad), no marcarlos como sospechosos totales; sí avisar de prorrateo.
NO es actividad típica: restauración/ocio personal, moda no relacionada, viajes vacacionales, gimnasio, mascotas personales, electrónica de consumo sin vínculo (TV, consolas), reformas estéticas de vivienda no afectas, etc.`;

export type ActivityFit = "ok" | "partial" | "suspicious";

export type ParsedExpenseDraft = {
  issueDate: string; // YYYY-MM-DD
  supplierName: string;
  supplierNif: string | null;
  invoiceNumber: string | null;
  description: string | null;
  category: string;
  /** INTERIOR | INTRACOMUNITARIA | SERVICIO_EXTRACOMUNITARIO */
  vatOperationType: ExpenseVatOperationType;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  notes: string | null;
  confidence: "high" | "medium" | "low";
  /** Encaje con la actividad WOD3D */
  activityFit: ActivityFit;
  /** Motivo breve en español (siempre si no es ok) */
  activityFitReason: string | null;
  /** Consejo home office / prorrateo si aplica */
  homeOfficeTip: string | null;
  /** FiscalDocument id si el original se guardó en Blob al parsear */
  documentId?: string | null;
};

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_BYTES = 8 * 1024 * 1024;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function categoryIds(): string[] {
  return EXPENSE_CATEGORIES.map((c) => c.id);
}

function normalizeCategory(raw: unknown): string {
  const s = String(raw ?? "OTROS").toUpperCase().trim();
  return categoryIds().includes(s) ? s : "OTROS";
}

function normalizeVatRate(raw: unknown): number {
  const n = Number(raw);
  if (![0, 4, 10, 21].includes(n)) {
    if (!Number.isFinite(n) || n <= 0) return 21;
    if (n < 2) return 0;
    if (n < 7) return 4;
    if (n < 15.5) return 10;
    return 21;
  }
  return n;
}

function normalizeDate(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    return `${m[3]}-${mo}-${d}`;
  }
  return new Date().toISOString().slice(0, 10);
}

export function geminiConfigured(): boolean {
  return geminiKeyConfigured();
}

function normalizeActivityFit(raw: unknown): ActivityFit {
  const s = String(raw ?? "ok").toLowerCase().trim();
  if (s === "partial" || s === "suspicious") return s;
  return "ok";
}

function parseDraftFromText(text: string): ParsedExpenseDraft {
  if (!text.trim()) {
    throw new Error("Gemini no devolvió datos. Prueba con otra imagen/PDF.");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("No se pudo interpretar la respuesta de Gemini");
    parsed = JSON.parse(m[0]) as Record<string, unknown>;
  }

  const subtotal = round2(Math.max(0, Number(parsed.subtotal) || 0));
  const vatOperationType = parseExpenseVatOperationType(
    parsed.vatOperationType
  );
  const reverseCharge = isExpenseReverseCharge(vatOperationType);
  let vatRate = normalizeVatRate(parsed.vatRate);
  if (reverseCharge && vatRate === 0) vatRate = 21;
  let vatAmount = round2(Math.max(0, Number(parsed.vatAmount) || 0));
  let total = round2(Math.max(0, Number(parsed.total) || 0));

  if (reverseCharge) {
    if (!vatAmount && subtotal) {
      vatAmount = round2(subtotal * (vatRate / 100));
    }
    // Lo pagado al proveedor (UE/EEUU) suele ser la base sin IVA ES
    if (!total || Math.abs(total - (subtotal + vatAmount)) < 0.05) {
      total = subtotal;
    }
  } else {
    if (!vatAmount && subtotal && vatRate) {
      vatAmount = round2(subtotal * (vatRate / 100));
    }
    if (!total) {
      total = round2(subtotal + vatAmount);
    }
  }

  const confidenceRaw = String(parsed.confidence ?? "medium").toLowerCase();
  const confidence =
    confidenceRaw === "high" || confidenceRaw === "low"
      ? confidenceRaw
      : "medium";

  const supplierName = String(parsed.supplierName ?? "").trim();
  if (!supplierName) {
    throw new Error(
      "No se pudo leer el proveedor. Revisa el archivo o rellena a mano."
    );
  }

  const activityFit = normalizeActivityFit(parsed.activityFit);
  const activityFitReason =
    String(parsed.activityFitReason ?? "").trim() || null;
  const homeOfficeTip = String(parsed.homeOfficeTip ?? "").trim() || null;

  return {
    issueDate: normalizeDate(parsed.issueDate),
    supplierName,
    supplierNif: String(parsed.supplierNif ?? "").trim() || null,
    invoiceNumber: String(parsed.invoiceNumber ?? "").trim() || null,
    description: String(parsed.description ?? "").trim() || null,
    category: normalizeCategory(parsed.category),
    vatOperationType,
    subtotal,
    vatRate,
    vatAmount,
    total,
    notes: String(parsed.notes ?? "").trim() || null,
    confidence,
    activityFit,
    activityFitReason:
      activityFit === "ok" ? activityFitReason : activityFitReason ?? "Revisa si este gasto encaja con tu actividad.",
    homeOfficeTip,
  };
}

export async function parseExpenseDocument(file: {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}): Promise<ParsedExpenseDraft> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "Falta GEMINI_API_KEY (o GOOGLE_API_KEY) en las variables de entorno"
    );
  }

  const mime = resolveUploadMime(file.mimeType, file.fileName);
  if (!ALLOWED_MIME.has(mime)) {
    throw new Error("Formato no soportado. Usa PDF, JPG, PNG o WebP");
  }
  if (file.buffer.byteLength > MAX_BYTES) {
    throw new Error("El archivo supera 8 MB");
  }

  const categories = categoryIds().join(", ");
  const prompt = `Eres un asistente fiscal español. Extrae los datos de esta factura o ticket de GASTO (factura recibida / compra) para la empresa WOD3D.

PERFIL DE ACTIVIDAD:
${WOD3D_ACTIVITY_PROFILE}

Devuelve SOLO un JSON válido con esta forma exacta:
{
  "issueDate": "YYYY-MM-DD",
  "supplierName": "nombre del emisor/proveedor",
  "supplierNif": "NIF/CIF del proveedor o null",
  "invoiceNumber": "número de factura del proveedor o null",
  "description": "concepto breve en español o null",
  "category": "una de: ${categories}",
  "vatOperationType": "INTERIOR" | "INTRACOMUNITARIA" | "SERVICIO_EXTRACOMUNITARIO",
  "subtotal": 0,
  "vatRate": 21,
  "vatAmount": 0,
  "total": 0,
  "notes": "cualquier duda o dato ambiguo, o null",
  "confidence": "high" | "medium" | "low",
  "activityFit": "ok" | "partial" | "suspicious",
  "activityFitReason": "frase corta en español explicando el encaje, o null si ok claro",
  "homeOfficeTip": "si es suministro hogar (luz/agua/internet/gas/comunidad), consejo de prorrateo % afecto; si no aplica, null"
}

Reglas de extracción:
- Importes en euros (número, no string). Usa punto decimal.
- Si la factura está en USD u otra divisa: convierte a EUR con un tipo de cambio razonable (≈ BCE del mes) y anota el importe original en notes (p. ej. "Original: 60 USD").
- subtotal = base imponible en EUR (sin IVA español). vatAmount = cuota IVA a autorrepercutir. total = lo pagado al proveedor (normalmente = subtotal).
- invoiceNumber = nº de factura/ticket del emisor (Factura nº, Nº, Invoice #…). Si no se lee, null.
- Si hay varios tipos de IVA, usa el predominante o el del total; anótalo en notes.
- Si no hay IVA en factura interior española, vatRate=0, vatAmount=0, total=subtotal.
- vatOperationType = INTRACOMUNITARIA si: proveedor en la UE (VAT ID europeo DE/IE/FR/IT…), compra de bienes/servicios UE sin IVA español, "intra-community", AIB. subtotal = importe factura, vatRate = 21 (casi siempre), vatAmount = subtotal×21/100, total = subtotal. supplierNif = VAT ID UE.
- vatOperationType = SERVICIO_EXTRACOMUNITARIO si: proveedor fuera de la UE (EEUU, UK post-Brexit sin VAT UE, etc.), factura en USD, EIN/TIN en lugar de VAT, o texto "reverse charge" / "tax to be paid on reverse charge" sin VAT ID europeo (p. ej. Cursor/Anysphere, SaaS USA). Misma lógica numérica que intracom (base + 21% cuota, total = base). supplierNif = EIN/TIN si aparece, o null. NO es intracomunitaria UE.
- Si no hay indicios claros de intracom ni extracom → INTERIOR.
- No inventes NIF: si no se lee claramente, null.
- La fecha es la de la factura/ticket, no la de hoy.
- category: elige la más razonable (SOFTWARE, SUMINISTROS, MATERIAL, DIETAS, PROFESIONALES, OTROS).

Reglas activityFit (OBLIGATORIO valorar):
- "ok": material 3D/láser/joyería/parches, herramientas, packaging, envíos, software/hosting/marketplace, publicidad del negocio, servicios profesionales claros.
- "partial": suministro del hogar (luz, agua, internet, gas, comunidad, alquiler vivienda) u otro gasto mixto personal+profesional. Pon homeOfficeTip con aviso de deducir solo el % afecto a la actividad (no el 100%). category suele ser SUMINISTROS.
- "suspicious": parece gasto personal o ajeno a impresión 3D / láser / merchandising (restaurantes, ocio, ropa personal, viajes vacacionales, mascotas, electrónica de consumo sin vínculo, etc.). Explica por qué en activityFitReason. NO bloquees la extracción: solo avisa.
- En caso de duda razonable → "partial" con motivo, no "ok".`;

  const base64 = file.buffer.toString("base64");
  const text = await generateJsonWithFallback({
    apiKey,
    mime,
    base64,
    prompt,
  });
  return parseDraftFromText(text);
}
