/** Empareja nombres de archivo con gastos sin documento por nº de factura. */

export type ExpenseAttachCandidate = {
  id: string;
  issueDate: string; // YYYY-MM-DD
  supplierName: string;
  invoiceNumber: string | null;
  total: number;
};

export type ExpenseFileMatch = {
  fileName: string;
  expenseId: string | null;
  confidence: "high" | "low" | "none";
  reason: string;
};

export function normalizeInvoiceToken(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function fileBaseName(fileName: string): string {
  return fileName.replace(/^.*[/\\]/, "").replace(/\.[^.]+$/, "");
}

/**
 * Busca el gasto cuyo nº de factura aparece en el nombre del archivo.
 * Prioriza coincidencias más largas para evitar falsos positivos (p. ej. "0001").
 */
export function matchExpenseFileToCandidates(
  fileName: string,
  candidates: ExpenseAttachCandidate[]
): ExpenseFileMatch {
  const base = fileBaseName(fileName);
  const normFile = normalizeInvoiceToken(base);
  if (!normFile) {
    return {
      fileName,
      expenseId: null,
      confidence: "none",
      reason: "Nombre de archivo vacío",
    };
  }

  const ranked = candidates
    .map((c) => {
      const inv = c.invoiceNumber?.trim() ?? "";
      if (!inv) return null;
      const normInv = normalizeInvoiceToken(inv);
      if (normInv.length < 4) return null;
      if (!normFile.includes(normInv)) return null;
      return { c, normInv, len: normInv.length };
    })
    .filter(Boolean) as {
    c: ExpenseAttachCandidate;
    normInv: string;
    len: number;
  }[];

  ranked.sort((a, b) => b.len - a.len);

  if (!ranked.length) {
    return {
      fileName,
      expenseId: null,
      confidence: "none",
      reason: "No se encontró el nº de factura en el nombre",
    };
  }

  const best = ranked[0];
  const tied = ranked.filter((r) => r.len === best.len);
  if (tied.length > 1) {
    return {
      fileName,
      expenseId: null,
      confidence: "none",
      reason: `Varios gastos coinciden con «${best.c.invoiceNumber}»`,
    };
  }

  return {
    fileName,
    expenseId: best.c.id,
    confidence: best.len >= 8 ? "high" : "low",
    reason: `Nº factura ${best.c.invoiceNumber}`,
  };
}

export function matchExpenseFiles(
  fileNames: string[],
  candidates: ExpenseAttachCandidate[]
): ExpenseFileMatch[] {
  const used = new Set<string>();
  const out: ExpenseFileMatch[] = [];

  // Primero archivos con match más largo / high confidence
  const prelim = fileNames.map((f) =>
    matchExpenseFileToCandidates(f, candidates)
  );
  prelim.sort((a, b) => {
    const score = (m: ExpenseFileMatch) =>
      m.confidence === "high" ? 2 : m.confidence === "low" ? 1 : 0;
    return score(b) - score(a);
  });

  for (const m of prelim) {
    if (m.expenseId && used.has(m.expenseId)) {
      out.push({
        ...m,
        expenseId: null,
        confidence: "none",
        reason: `El gasto ya está asignado a otro archivo (${m.reason})`,
      });
      continue;
    }
    if (m.expenseId) used.add(m.expenseId);
    out.push(m);
  }

  // Restaurar orden original de archivos
  const byName = new Map(out.map((m) => [m.fileName, m]));
  return fileNames.map(
    (f) =>
      byName.get(f) ?? {
        fileName: f,
        expenseId: null,
        confidence: "none" as const,
        reason: "Sin emparejar",
      }
  );
}
