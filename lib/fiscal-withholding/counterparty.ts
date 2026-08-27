import { prisma } from "@/lib/prisma";
import {
  isUnmergeableTaxId,
  normalizeCounterpartyTaxId,
} from "@/lib/fiscal-withholding/amounts";
import {
  COUNTERPARTY_KIND,
  type CounterpartyKind,
} from "@/lib/fiscal-withholding/types";

export type ResolveCounterpartyInput = {
  taxId: string | null | undefined;
  name: string;
  countryCode?: string | null;
  kind?: CounterpartyKind;
  /**
   * Permite crear arrendador sin NIF (requiresReview).
   * NO inventa NIF fiscal: usa clave sintética única no fusionable.
   */
  allowMissingTaxId?: boolean;
};

export type ResolveCounterpartyResult = {
  id: string;
  taxId: string;
  normalizedTaxId: string;
  name: string;
  countryCode: string;
  kind: string;
  requiresReview: boolean;
  reviewReason: string | null;
  created: boolean;
};

/**
 * Resuelve o crea FiscalCounterparty por NIF normalizado.
 * No fusiona NIF vacío / PEND- / VARIOS salvo allowMissingTaxId (arrendador).
 */
export async function resolveOrCreateFiscalCounterparty(
  input: ResolveCounterpartyInput
): Promise<ResolveCounterpartyResult> {
  const taxIdRaw = String(input.taxId ?? "").trim();
  const normalizedTaxId = normalizeCounterpartyTaxId(taxIdRaw);
  const name = String(input.name ?? "").trim();
  const kind = input.kind ?? COUNTERPARTY_KIND.PROFESSIONAL;
  const countryCode = (input.countryCode ?? "ES").trim().toUpperCase() || "ES";
  const allowMissing = Boolean(input.allowMissingTaxId);

  if (!name) {
    throw new Error("El nombre de la contraparte fiscal es obligatorio.");
  }

  if (isUnmergeableTaxId(taxIdRaw)) {
    if (!allowMissing) {
      throw new Error(
        "No se puede crear una contraparte fiscal con NIF vacío, PEND- o VARIOS. Corrige el NIF."
      );
    }
    // Sin NIF: no dedupe — cada alta es distinta y queda en revisión.
    const synthetic = `REVIEW:MISSING:${kind}:${Date.now()}:${Math.random()
      .toString(36)
      .slice(2, 10)}`.toUpperCase();
    const created = await prisma.fiscalCounterparty.create({
      data: {
        taxId: "",
        normalizedTaxId: synthetic,
        name,
        countryCode,
        kind,
        requiresReview: true,
        reviewReason: "NIF ausente — requiere revisión. No se inventó identificador fiscal.",
      },
    });
    return {
      id: created.id,
      taxId: created.taxId,
      normalizedTaxId: created.normalizedTaxId,
      name: created.name,
      countryCode: created.countryCode,
      kind: created.kind,
      requiresReview: created.requiresReview,
      reviewReason: created.reviewReason,
      created: true,
    };
  }

  const existing = await prisma.fiscalCounterparty.findUnique({
    where: { normalizedTaxId },
  });

  if (existing) {
    const nameChanged =
      existing.name.trim().toLowerCase() !== name.toLowerCase();
    const kindChanged = existing.kind !== kind;
    let requiresReview = existing.requiresReview;
    let reviewReason = existing.reviewReason;

    if (nameChanged || kindChanged) {
      requiresReview = true;
      const parts: string[] = [];
      if (nameChanged) {
        parts.push(`nombre distinto («${existing.name}» vs «${name}»)`);
      }
      if (kindChanged) {
        parts.push(`tipo distinto (${existing.kind} vs ${kind})`);
      }
      reviewReason = `Revisión: ${parts.join("; ")}. No se fusionó automáticamente.`;
    }

    const updated = await prisma.fiscalCounterparty.update({
      where: { id: existing.id },
      data: {
        // Conservar taxId canónico normalizado; actualizar display name si vacío
        name: existing.name.trim() ? existing.name : name,
        taxId: existing.taxId || taxIdRaw || normalizedTaxId,
        requiresReview,
        reviewReason,
        // No cambiar kind silenciosamente si diverge
        ...(kindChanged ? {} : { kind }),
      },
    });

    return {
      id: updated.id,
      taxId: updated.taxId,
      normalizedTaxId: updated.normalizedTaxId,
      name: updated.name,
      countryCode: updated.countryCode,
      kind: updated.kind,
      requiresReview: updated.requiresReview,
      reviewReason: updated.reviewReason,
      created: false,
    };
  }

  const created = await prisma.fiscalCounterparty.create({
    data: {
      taxId: taxIdRaw || normalizedTaxId,
      normalizedTaxId,
      name,
      countryCode,
      kind,
      requiresReview: false,
      reviewReason: null,
    },
  });

  return {
    id: created.id,
    taxId: created.taxId,
    normalizedTaxId: created.normalizedTaxId,
    name: created.name,
    countryCode: created.countryCode,
    kind: created.kind,
    requiresReview: created.requiresReview,
    reviewReason: created.reviewReason,
    created: true,
  };
}
