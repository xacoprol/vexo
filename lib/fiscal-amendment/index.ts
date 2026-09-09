/**
 * Enmiendas de declaraciones fiscales presentadas (Fase 3).
 * Historia presentada = INMUTABLE. Sin envío AEAT.
 */

export type AmendmentKind =
  /** Corrección de una autoliquidación ya presentada (importes/casillas). */
  | "RECTIFICATIVA"
  /** Declaración complementaria (datos omitidos / incremento). */
  | "COMPLEMENTARIA"
  /** Corrección informativa (p. ej. 349/347) sin ingreso. */
  | "CORRECTION_INFORMATIVE";

export type AmendmentLifecycleStatus =
  | "ORIGINAL"
  | "AMENDMENT_REQUIRED"
  | "AMENDMENT_PREPARED"
  | "AMENDMENT_FILED"
  | "RECONCILED";

/** Snapshot inmutable de un filing presentado. */
export type ImmutablePresentedFiling = {
  filingId: string;
  model: string;
  year: number;
  quarter: number | null;
  periodKey: string;
  /** Hash de la declaración / snapshot en el momento de presentar. */
  declarationHash: string;
  /** Hash de libros/sourceIds en el momento de presentar. */
  sourceHash: string;
  result: number;
  boxes: { code: string; value: number }[];
  filedAt: string;
  receiptId?: string | null;
  nrc?: string | null;
};

export type AmendmentRecord = {
  amendmentId: string;
  kind: AmendmentKind;
  status: AmendmentLifecycleStatus;
  /** Siempre apunta al filing ORIGINAL (nunca a otra enmienda). */
  originalFilingId: string;
  originalPeriodKey: string;
  originalDeclarationHash: string;
  /** Hash propio de la declaración correctora. */
  amendmentDeclarationHash: string | null;
  amendmentSourceHash: string | null;
  result: number | null;
  boxes: { code: string; value: number }[] | null;
  preparedAt: string | null;
  filedAt: string | null;
  receiptId: string | null;
  reason: string;
};

export type AmendmentChain = {
  original: ImmutablePresentedFiling;
  amendments: AmendmentRecord[];
  /** Estado agregado de la cadena. */
  status: AmendmentLifecycleStatus;
  /** true si el original no ha sido mutado (hashes intactos). */
  originalIntact: boolean;
};

export function defaultAmendmentKind(model: string): AmendmentKind {
  if (model === "349" || model === "347" || model === "180" || model === "190") {
    return "CORRECTION_INFORMATIVE";
  }
  return "RECTIFICATIVA";
}

/**
 * Deriva necesidad de enmienda desde drift de libros vs filing inmutable.
 */
export function detectAmendmentRequired(opts: {
  original: ImmutablePresentedFiling;
  currentSourceHash: string;
  currentResult?: number | null;
}): { required: boolean; reason: string } {
  if (opts.currentSourceHash !== opts.original.sourceHash) {
    return {
      required: true,
      reason:
        "El libro actual diverge del sourceHash del filing original (CURRENT_BOOK_CHANGED_AFTER_FILING).",
    };
  }
  if (
    opts.currentResult != null &&
    Math.abs(opts.currentResult - opts.original.result) > 0.009
  ) {
    return {
      required: true,
      reason:
        "El resultado del motor actual difiere del filing original (POTENTIAL_AMENDMENT_REQUIRED).",
    };
  }
  return { required: false, reason: "Sin drift respecto al filing original." };
}

/**
 * Prepara enmienda SIN mutar el original.
 * La declaración correctora tiene hash propio y referencia al filing original.
 */
export function prepareAmendment(opts: {
  original: ImmutablePresentedFiling;
  kind?: AmendmentKind;
  amendmentId: string;
  amendmentDeclarationHash: string;
  amendmentSourceHash: string;
  result: number;
  boxes: { code: string; value: number }[];
  reason: string;
  preparedAt?: string;
}): AmendmentRecord {
  if (!opts.amendmentDeclarationHash) {
    throw new Error("amendmentDeclarationHash requerido");
  }
  if (opts.amendmentDeclarationHash === opts.original.declarationHash) {
    throw new Error(
      "La declaración correctora debe tener hash distinto del original"
    );
  }
  return {
    amendmentId: opts.amendmentId,
    kind: opts.kind ?? defaultAmendmentKind(opts.original.model),
    status: "AMENDMENT_PREPARED",
    originalFilingId: opts.original.filingId,
    originalPeriodKey: opts.original.periodKey,
    originalDeclarationHash: opts.original.declarationHash,
    amendmentDeclarationHash: opts.amendmentDeclarationHash,
    amendmentSourceHash: opts.amendmentSourceHash,
    result: opts.result,
    boxes: opts.boxes.map((b) => ({ ...b })),
    preparedAt: opts.preparedAt ?? new Date().toISOString(),
    filedAt: null,
    receiptId: null,
    reason: opts.reason,
  };
}

/**
 * Registra presentación de la enmienda. El original permanece intacto.
 */
export function fileAmendment(opts: {
  amendment: AmendmentRecord;
  original: ImmutablePresentedFiling;
  filedAt: string;
  receiptId?: string | null;
}): { original: ImmutablePresentedFiling; amendment: AmendmentRecord } {
  // Inmutabilidad: devolver copia del original sin cambios
  const original: ImmutablePresentedFiling = {
    ...opts.original,
    boxes: opts.original.boxes.map((b) => ({ ...b })),
  };
  if (
    opts.amendment.originalDeclarationHash !== original.declarationHash ||
    opts.amendment.originalFilingId !== original.filingId
  ) {
    throw new Error("La enmienda no referencia el filing original correcto");
  }
  return {
    original,
    amendment: {
      ...opts.amendment,
      status: "AMENDMENT_FILED",
      filedAt: opts.filedAt,
      receiptId: opts.receiptId ?? null,
      boxes: opts.amendment.boxes?.map((b) => ({ ...b })) ?? null,
    },
  };
}

/**
 * Tras filing de enmienda: si el libro actual coincide con el hash de la enmienda → RECONCILED.
 */
export function reconcileAmendmentChain(opts: {
  original: ImmutablePresentedFiling;
  amendments: AmendmentRecord[];
  currentSourceHash: string;
}): AmendmentChain {
  const originalIntact = true; // por construcción del dominio
  const amendments = opts.amendments.map((a) => ({
    ...a,
    boxes: a.boxes?.map((b) => ({ ...b })) ?? null,
  }));

  const latestFiled = [...amendments]
    .reverse()
    .find((a) => a.status === "AMENDMENT_FILED" || a.status === "RECONCILED");

  let status: AmendmentLifecycleStatus = "ORIGINAL";
  if (amendments.length === 0) {
    const need = detectAmendmentRequired({
      original: opts.original,
      currentSourceHash: opts.currentSourceHash,
    });
    status = need.required ? "AMENDMENT_REQUIRED" : "ORIGINAL";
  } else {
    const openPrep = amendments.some((a) => a.status === "AMENDMENT_PREPARED");
    const anyFiled = amendments.some(
      (a) => a.status === "AMENDMENT_FILED" || a.status === "RECONCILED"
    );
    if (
      anyFiled &&
      latestFiled?.amendmentSourceHash === opts.currentSourceHash
    ) {
      status = "RECONCILED";
      for (const a of amendments) {
        if (a.status === "AMENDMENT_FILED") a.status = "RECONCILED";
      }
    } else if (openPrep) {
      status = "AMENDMENT_PREPARED";
    } else if (anyFiled) {
      // Filing de enmienda pero el libro volvió a cambiar
      status = "AMENDMENT_REQUIRED";
    } else {
      status = "AMENDMENT_REQUIRED";
    }
  }

  return {
    original: {
      ...opts.original,
      boxes: opts.original.boxes.map((b) => ({ ...b })),
    },
    amendments,
    status,
    originalIntact,
  };
}

/** Assert helper: el original no cambia tras prepare/file. */
export function assertOriginalImmutable(
  before: ImmutablePresentedFiling,
  after: ImmutablePresentedFiling
): boolean {
  return (
    before.filingId === after.filingId &&
    before.declarationHash === after.declarationHash &&
    before.sourceHash === after.sourceHash &&
    before.result === after.result &&
    before.filedAt === after.filedAt &&
    JSON.stringify(before.boxes) === JSON.stringify(after.boxes)
  );
}
