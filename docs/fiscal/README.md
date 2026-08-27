# Núcleo fiscal VEXO v1

Arquitectura de liquidación trimestral para autónomos (AEAT), sin API de presentación automática.

## Cadena E2E

```
DATA → OBLIGATIONS → HEALTH → CLOSE ACTIONS → READY_TO_FILE
  → PRE-FILING FREEZE → READY_FOR_SUBMISSION → DECLARATION
  → ASSISTED AEAT → MANUAL_AEAT FILING → RECONCILIATION → CLOSED
```

Detalle de estados: [e2e-lifecycle.md](./e2e-lifecycle.md).  
AEAT: [aeat-submission.md](./aeat-submission.md).  
Limitaciones: [known-limitations.md](./known-limitations.md).  
Producción: [production-checklist.md](./production-checklist.md).

## Capas

| Capa | Responsabilidad | Paths clave |
|------|-----------------|-------------|
| Motors | Cálculo 130/303/349/111/115… | `lib/modelo-*`, `lib/fiscal.ts` |
| Obligations | REQUIRED / NOT_REQUIRED / UNKNOWN | `lib/fiscal-obligations/` |
| Health | Blockers / warnings accionables | `lib/fiscal-health/` |
| Close | Acciones UX + lifecycle | `lib/fiscal-validation/`, `lib/fiscal-close/` |
| Snapshots | Congelado por modelo + hashes | `lib/fiscal-snapshot/` |
| Pre-filing | Freeze CAS (`FiscalPreFilingReview`) | `lib/fiscal-close/pre-filing.ts` |
| Declaration | Builders desde freeze (no recalc) | `lib/fiscal-declaration/` |
| Submission | Asistido + MANUAL_AEAT | `lib/fiscal-submission/` |
| Reconciliation | Filed vs current book | `lib/fiscal-snapshot/reconcile.ts` |

## Modelos soportados (trimestral v1)

| Modelo | Motor | Freeze/detail | Declaration | Presentación |
|--------|-------|---------------|-------------|--------------|
| 130 | Sí | boxes | Sí | ASSISTED |
| 303 | Sí | boxes + outcome | Sí | ASSISTED |
| 349 | Sí | ops A/I | Sí | ASSISTED |
| 111 | Sí | payees | Sí | ASSISTED |
| 115 | Sí | landlords | Sí | ASSISTED |

Anuales (180/190/347/390) y censales: motores/UI parciales; no cierran el trimestre v1.

## Lifecycle (derivado, no columna DB)

- **OPEN** — no readyToFile (blockers / Health NOT_READY).
- **READY_TO_FILE** — Health OK; sin freeze vigente.
- **READY_FOR_SUBMISSION** — freeze vigente, hashes alineados.
- **STALE_REVIEW** — book/censo/motor cambiaron tras freeze.
- **FILED** — estado por **obligación/modelo** (`filingStatus`), no periodo.
- **CLOSED** — todas las REQUIRED del trimestre tienen `FiscalFiling`.

## Hashes

- `sourceHash` — universo de IDs del libro del periodo.
- `censusHash` — campos censales relevantes (no branding).
- `declarationHash` — artefacto canónico (excluye `generatedAt` / validation).

## `FISCAL_ENGINE_VERSION`

Valor actual: `vexo-fiscal-0.1.0` (`lib/fiscal-snapshot/types.ts`).

Bump **solo** si cambia lógica fiscal que invalida freezes previos (fórmulas, mapping de casillas, universo de fuentes). **No** bump por UX, docs, tests o AEAT assisted. No usar git SHA.

## Auth / tenant v1

- Login NextAuth; rol efectivo `FISCAL_ADMIN` (`lib/fiscal-auth.ts`).
- Single-tenant: `CompanySettings` singleton.
- Soft-tenant: NIF como `tenantKey` en declaration/submission attempts.
- Mutaciones: Server Actions + `requireAuth` (CSRF del framework).

## AEAT

Sin API pública. Flujo: preview → Sede → justificante → `MANUAL_AEAT` → `FiscalFiling` + `FiscalSubmissionAttempt`.

## Fórmulas

No se alteran para satisfacer schemas externos ni OCR gestoría. Cambios solo con bug inequívoco documentado.
