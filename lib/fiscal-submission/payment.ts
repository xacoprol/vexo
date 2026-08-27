/**
 * Requisitos de pago / NRC (contrato; sin generación de NRC).
 */

import type { DeclarationModelCode } from "@/lib/fiscal-declaration/types";
import { getAeatCapability } from "@/lib/fiscal-submission/capability";
import type { FiscalPaymentRequirement } from "@/lib/fiscal-submission/types";
import { parseMoney } from "@/lib/fiscal-declaration/money";

export function assessPaymentRequirement(opts: {
  model: DeclarationModelCode;
  result: string | null;
}): FiscalPaymentRequirement {
  const cap = getAeatCapability(opts.model);
  const amount = opts.result != null ? parseMoney(opts.result) : null;

  if (!cap.nrcWhenPayable) {
    return {
      status: "NONE",
      amount: opts.result,
      currency: "EUR",
      notes: "Modelo informativo o sin ingreso típico; NRC no aplica.",
    };
  }

  if (amount == null || amount <= 0) {
    return {
      status: "NONE",
      amount: opts.result,
      currency: "EUR",
      notes:
        "Sin importe a ingresar (cero, a compensar o a devolver). Completar resultado en Sede; no generar NRC.",
    };
  }

  return {
    status: "NRC_REQUIRED",
    amount: opts.result,
    currency: "EUR",
    notes:
      "Autoliquidación a ingresar: obtener NRC en entidad colaboradora o domiciliar en Sede. VEXO no genera NRC ni paga.",
  };
}
