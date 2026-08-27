/**
 * Validación estructural de declaración (no normativa compleja).
 */

import { isValidSpanishTaxId, normalizeTaxId } from "@/lib/nif";
import type { FiscalModelSnapshotV1 } from "@/lib/fiscal-snapshot/types";
import { assessSnapshotCompleteness } from "@/lib/fiscal-close/enrich-snapshots";
import {
  moneyStringsEqual,
  parseMoney,
} from "@/lib/fiscal-declaration/money";
import type {
  DeclarationModelCode,
  FiscalDeclarationDraft,
  FiscalDeclarationValidationIssue,
} from "@/lib/fiscal-declaration/types";

export function validateFiscalDeclarationDraft(
  draft: Omit<FiscalDeclarationDraft, "validation"> & {
    validation?: FiscalDeclarationDraft["validation"];
  },
  frozenModel: FiscalModelSnapshotV1 | null
): {
  valid: boolean;
  errors: FiscalDeclarationValidationIssue[];
  warnings: FiscalDeclarationValidationIssue[];
} {
  const errors: FiscalDeclarationValidationIssue[] = [];
  const warnings: FiscalDeclarationValidationIssue[] = [];

  if (!draft.model) {
    errors.push({
      code: "REQUIRED_FIELD_MISSING",
      message: "Falta modelo",
      field: "model",
      severity: "ERROR",
    });
  }
  if (!draft.year || draft.quarter < 1 || draft.quarter > 4) {
    errors.push({
      code: "INVALID_PERIOD",
      message: "Periodo inválido",
      field: "period",
      severity: "ERROR",
    });
  }
  if (!draft.preFilingReviewId) {
    errors.push({
      code: "REQUIRED_FIELD_MISSING",
      message: "Falta preFilingReviewId",
      field: "preFilingReviewId",
      severity: "ERROR",
    });
  }

  if (draft.metadata.nif) {
    if (!isValidSpanishTaxId(draft.metadata.nif)) {
      errors.push({
        code: "INVALID_NIF",
        message: `NIF contribuyente inválido: ${normalizeTaxId(draft.metadata.nif)}`,
        field: "metadata.nif",
        severity: "ERROR",
      });
    }
  } else {
    warnings.push({
      code: "REQUIRED_FIELD_MISSING",
      message: "NIF contribuyente no informado en metadata",
      field: "metadata.nif",
      severity: "WARNING",
    });
  }

  if (!frozenModel) {
    errors.push({
      code: "SNAPSHOT_INCOMPLETE",
      message: "No hay snapshot de modelo en el freeze",
      severity: "ERROR",
    });
  } else {
    const completeness = assessSnapshotCompleteness(frozenModel);
    if (!completeness.complete) {
      errors.push({
        code: "SNAPSHOT_INCOMPLETE",
        message: `Snapshot incompleto: ${completeness.missing.join(", ")}`,
        severity: "ERROR",
      });
    }

    if (draft.sourceHash !== frozenModel.sourceHash) {
      // period sourceHash vs model sourceHash may differ — compare at review level in gate
    }

    if (draft.engineVersion !== frozenModel.engineVersion) {
      errors.push({
        code: "DECLARATION_SNAPSHOT_MISMATCH",
        message: "engineVersion declaración ≠ snapshot",
        severity: "ERROR",
      });
    }

    if (!moneyStringsEqual(draft.result, frozenModel.result)) {
      errors.push({
        code: "TOTAL_MISMATCH",
        message: `Resultado ${draft.result} ≠ congelado ${frozenModel.result}`,
        field: "result",
        severity: "ERROR",
      });
    }

    // Casillas: todas las del freeze deben coincidir
    for (const [k, v] of Object.entries(frozenModel.boxes ?? {})) {
      if (!moneyStringsEqual(draft.boxes[k] ?? null, v)) {
        errors.push({
          code: "DECLARATION_SNAPSHOT_MISMATCH",
          message: `Casilla ${k} diverge del snapshot`,
          field: `boxes.${k}`,
          severity: "ERROR",
        });
      }
    }
  }

  if (draft.model === "349" && draft.detail?.operations) {
    for (const op of draft.detail.operations) {
      if (!op.vatId || op.vatId.length < 4) {
        errors.push({
          code: "INVALID_VAT_ID",
          message: `VAT ID inválido: ${op.vatId}`,
          field: "detail.operations",
          severity: "ERROR",
        });
      }
      if (!["A", "I", "E", "S"].includes(op.key)) {
        warnings.push({
          code: "UNSUPPORTED_BOX",
          message: `Clave 349 ${op.key} no habitual`,
          severity: "WARNING",
        });
      }
    }
  }

  // Coherencia suma 349
  if (draft.model === "349" && draft.detail?.operations && draft.result) {
    const sum = draft.detail.operations.reduce(
      (s, o) => s + (Number(o.amount) || 0),
      0
    );
    const r = parseMoney(draft.result);
    if (r != null && Math.abs(sum - r) > 0.05) {
      // totals may exclude some keys — soft check
      warnings.push({
        code: "TOTAL_MISMATCH",
        message: "Suma operadores vs result con tolerancia amplia",
        severity: "WARNING",
      });
    }
  }

  void (draft.model as DeclarationModelCode);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
