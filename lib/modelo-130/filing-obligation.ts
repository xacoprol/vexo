export type FilingObligationStatus = "REQUIRED" | "NOT_REQUIRED" | "UNKNOWN";

export type FilingObligation = {
  status: FilingObligationStatus;
  reasons: string[];
};

/**
 * Separa el cálculo del borrador 130 de la obligación de presentarlo.
 * Sin datos de actividad / ejercicio anterior → UNKNOWN (nunca REQUIRED silencioso).
 */
export function assess130FilingObligation(opts: {
  fiscalRegime: "130" | "131";
  /** Ingresos YTD computables sección I. */
  incomeBaseYtd: number;
  /** Ingresos YTD con retención/ingreso a cuenta. */
  incomeWithWithholdingYtd: number;
  /** Si se conoce que es actividad profesional (null = desconocido). */
  isProfessionalActivity?: boolean | null;
  /** % ingresos con retención ejercicio anterior (null = desconocido). */
  priorYearWithholdingPct?: number | null;
  /** Primer año con actividad (null = desconocido). */
  activityStartYear?: number | null;
  currentYear: number;
}): FilingObligation {
  const reasons: string[] = [];

  if (opts.fiscalRegime === "131") {
    return {
      status: "UNKNOWN",
      reasons: [
        "Régimen 131 (módulos): la obligación de presentar el 130 depende de actividades en estimación directa. VEXO no determina el reparto.",
      ],
    };
  }

  if (opts.isProfessionalActivity == null) {
    reasons.push(
      "No está configurado si la actividad es profesional o empresarial."
    );
  }

  if (opts.priorYearWithholdingPct == null) {
    reasons.push(
      "Desconocido el % de ingresos sometidos a retención en el ejercicio anterior."
    );
  } else if (
    opts.isProfessionalActivity === true &&
    opts.priorYearWithholdingPct >= 70
  ) {
    return {
      status: "NOT_REQUIRED",
      reasons: [
        `Actividad profesional: ≥ 70 % ingresos con retención el ejercicio anterior (${opts.priorYearWithholdingPct} %).`,
      ],
    };
  }

  if (
    opts.activityStartYear != null &&
    opts.activityStartYear === opts.currentYear &&
    opts.incomeBaseYtd > 0
  ) {
    const pct =
      opts.incomeBaseYtd > 0
        ? round2((opts.incomeWithWithholdingYtd / opts.incomeBaseYtd) * 100)
        : 0;
    if (opts.isProfessionalActivity === true && pct >= 70) {
      return {
        status: "NOT_REQUIRED",
        reasons: [
          `Inicio de actividad: ${pct} % ingresos con retención en el trimestre (≥ 70 %).`,
        ],
      };
    }
    reasons.push(
      "Inicio de actividad: falta confirmar tipo de actividad para aplicar la exención por retenciones."
    );
  }

  if (reasons.length === 0) {
    return {
      status: "UNKNOWN",
      reasons: [
        "Datos insuficientes para determinar si existe obligación de presentar el 130.",
      ],
    };
  }

  return { status: "UNKNOWN", reasons };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
