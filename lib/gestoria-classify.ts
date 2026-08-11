/**
 * Clasificación del paquete gestoría por nombre de archivo.
 */

export type GestoriaClass =
  | {
      kind: "filing";
      modelType: "303" | "130" | "390" | "347" | "349" | "036";
      year: number;
      quarter: number | null;
      category: "FILING" | "CENSUS";
    }
  | {
      kind: "book";
      bookType: "INGRESOS" | "GASTOS" | "BIENES";
      year: number;
      category: "BOOK";
    }
  | {
      kind: "payment";
      category: "PAYMENT";
    }
  | {
      kind: "irpf";
      category: "IRPF";
      year: number | null;
    }
  | {
      kind: "census";
      category: "CENSUS";
      year: number | null;
    }
  | {
      kind: "other";
      category: "OTHER";
    };

const OPERATIVE_YEAR = 2026;
const OPERATIVE_QUARTER = 3;

/** ¿Se crea FiscalFiling operativo (solo 3T 2026 o anuales vigentes)? */
export function shouldUpsertOperativeFiling(
  modelType: string,
  year: number,
  quarter: number | null
): boolean {
  if (modelType === "036") return true;
  if (modelType === "390" || modelType === "347") {
    return year >= OPERATIVE_YEAR - 1;
  }
  return year === OPERATIVE_YEAR && quarter === OPERATIVE_QUARTER;
}

export function classifyGestoriaFileName(fileName: string): GestoriaClass {
  const name = fileName.trim();
  const upper = name.toUpperCase();

  const libro = /LIBRO\s+REGISTRO\s+(INGRESOS|GASTOS|BIENES(?:\s+INVERSION)?)\s+(20\d{2})/i.exec(
    name
  );
  if (libro) {
    const raw = libro[1].toUpperCase();
    const bookType = raw.startsWith("BIENES")
      ? "BIENES"
      : (raw as "INGRESOS" | "GASTOS");
    return {
      kind: "book",
      bookType,
      year: parseInt(libro[2], 10),
      category: "BOOK",
    };
  }

  const quarterly = /^(130|303|349)_(\d)T_(20\d{2})/i.exec(name);
  if (quarterly) {
    return {
      kind: "filing",
      modelType: quarterly[1].toUpperCase() as "130" | "303" | "349",
      year: parseInt(quarterly[3], 10),
      quarter: parseInt(quarterly[2], 10),
      category: "FILING",
    };
  }

  const annual347 = /^347_0A_(20\d{2})/i.exec(name);
  if (annual347) {
    return {
      kind: "filing",
      modelType: "347",
      year: parseInt(annual347[1], 10),
      quarter: null,
      category: "FILING",
    };
  }

  const annual390 = /^390(?:_0A)?[_\s-]*(20\d{2})/i.exec(name);
  if (annual390 || /^390\s+(20\d{2})/i.test(name)) {
    const y = annual390
      ? parseInt(annual390[1], 10)
      : parseInt(/390\s+(20\d{2})/i.exec(name)![1], 10);
    return {
      kind: "filing",
      modelType: "390",
      year: y,
      quarter: null,
      category: "FILING",
    };
  }

  if (/MOD\s*036|036\s*ALTA/i.test(name)) {
    const y = /(20\d{2})/.exec(name);
    return {
      kind: "filing",
      modelType: "036",
      year: y ? parseInt(y[1], 10) : 2024,
      quarter: null,
      category: "CENSUS",
    };
  }

  if (/CENSAL|I\.A\.E|IAE/i.test(upper)) {
    const y = /(20\d{2})/.exec(name);
    return {
      kind: "census",
      category: "CENSUS",
      year: y ? parseInt(y[1], 10) : null,
    };
  }

  if (/PAGOS\s+REALIZADOS/i.test(name)) {
    return { kind: "payment", category: "PAYMENT" };
  }

  if (/RENTA|100_20/i.test(upper)) {
    const y = /(20\d{2})/.exec(name);
    return {
      kind: "irpf",
      category: "IRPF",
      year: y ? parseInt(y[1], 10) : null,
    };
  }

  return { kind: "other", category: "OTHER" };
}

export function titleForGestoriaFile(
  fileName: string,
  classified: GestoriaClass
): string {
  if (classified.kind === "filing") {
    const q =
      classified.quarter != null ? ` ${classified.quarter}T` : "";
    return `Modelo ${classified.modelType}${q} ${classified.year}`;
  }
  if (classified.kind === "book") {
    return `Libro registro ${classified.bookType.toLowerCase()} ${classified.year}`;
  }
  if (classified.kind === "payment") return "Pagos AEAT";
  if (classified.kind === "census") return fileName.replace(/\.[^.]+$/, "");
  if (classified.kind === "irpf") return `IRPF / renta ${classified.year ?? ""}`.trim();
  return fileName.replace(/\.[^.]+$/, "") || fileName;
}
