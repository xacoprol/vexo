/**
 * Autorización fiscal v1 (Fase 17).
 *
 * VEXO es single-tenant operativo (CompanySettings singleton).
 * Auth = NextAuth credentials; no hay tabla Role.
 * Todo usuario autenticado actúa como FISCAL_ADMIN.
 *
 * Soft-tenant: NIF de settings como tenantKey en declaration/submission.
 */

export type FiscalRole = "FISCAL_ADMIN" | "UNAUTHENTICATED";

export type FiscalCapability =
  | "VIEW_HEALTH"
  | "VIEW_CLOSE"
  | "EDIT_CENSUS"
  | "FREEZE_PRE_FILING"
  | "GENERATE_DECLARATION"
  | "PREPARE_SUBMISSION"
  | "REGISTER_MANUAL_FILING"
  | "RECLASSIFY_EU_EXPENSE";

/** Matriz v1: autenticado = admin completo. */
export const FISCAL_ROLE_CAPABILITIES: Record<
  FiscalRole,
  ReadonlySet<FiscalCapability>
> = {
  FISCAL_ADMIN: new Set([
    "VIEW_HEALTH",
    "VIEW_CLOSE",
    "EDIT_CENSUS",
    "FREEZE_PRE_FILING",
    "GENERATE_DECLARATION",
    "PREPARE_SUBMISSION",
    "REGISTER_MANUAL_FILING",
    "RECLASSIFY_EU_EXPENSE",
  ]),
  UNAUTHENTICATED: new Set(),
};

export function roleFromSession(hasUser: boolean): FiscalRole {
  return hasUser ? "FISCAL_ADMIN" : "UNAUTHENTICATED";
}

export function canFiscal(
  role: FiscalRole,
  capability: FiscalCapability
): boolean {
  return FISCAL_ROLE_CAPABILITIES[role].has(capability);
}

export type TenantAssertResult =
  | { ok: true }
  | { ok: false; code: "TENANT_MISMATCH"; message: string };

/**
 * Soft isolation: comparar tenantKey declarado vs esperado (NIF / default).
 * No sustituye RLS multi-tenant.
 */
export function assertSameFiscalTenant(
  expected: string | null | undefined,
  actual: string | null | undefined
): TenantAssertResult {
  const a = (expected ?? "default").trim().toUpperCase() || "DEFAULT";
  const b = (actual ?? "default").trim().toUpperCase() || "DEFAULT";
  if (a !== b) {
    return {
      ok: false,
      code: "TENANT_MISMATCH",
      message: "Tenant fiscal no coincide; acceso denegado.",
    };
  }
  return { ok: true };
}

/**
 * Mutaciones sensibles: protegidas por Next.js Server Actions (cookie session +
 * origin check del framework). No CSRF token paralelo en v1.
 */
export const FISCAL_SENSITIVE_MUTATIONS = [
  "confirmFiscalPeriodReview",
  "updateExpenseVatOperationType",
  "prepareAssistedSubmissionAction",
  "registerManualAeatFilingAction",
  "generateDeclarationAction",
] as const;
