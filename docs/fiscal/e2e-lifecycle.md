# Lifecycle E2E — estados y transiciones

Estados de **periodo** (`CloseLifecycleStatus`) son **derivados** en cada request; no hay columna `status` en DB.

## Periodo

| STATE | ENTRA DESDE | SALE HACIA | BLOQUEADORES | DATOS PERSISTIDOS |
|-------|-------------|------------|--------------|-------------------|
| OPEN | Arranque / Health NOT_READY | READY_TO_FILE (si Health OK) | blockers Health, censo UNKNOWN crítico | libro (facturas/gastos), settings |
| READY_TO_FILE | OPEN sin blockers | READY_FOR_SUBMISSION (freeze) o OPEN (nuevo blocker) | ninguno de Health; puede haber warnings | igual |
| READY_FOR_SUBMISSION | freeze CAS OK | STALE_REVIEW (drift), CLOSED (todos filed), STALE al editar | stale hashes | `FiscalPreFilingReview` |
| STALE_REVIEW | drift tras freeze | READY_TO_FILE (re-freeze) | source/census/engine drift | review anterior `supersededAt` |
| FILED | — | — | **No es estado de periodo** | por modelo: `FiscalFiling` + `filingStatus=FILED` |
| CLOSED | todos REQUIRED filed + 0 UNKNOWN | (reabre conceptualmente si aparece UNKNOWN o se borra filing — no soportado en UI) | UNKNOWN obligations | filings de todos REQUIRED |

### Transiciones inválidas (invariantes)

- READY_TO_FILE con `health.blockers.length > 0` → **imposible** (freeze rechaza).
- READY_FOR_SUBMISSION sin `FiscalPreFilingReview` vigente → **imposible**.
- READY_FOR_SUBMISSION con drift → debe ser **STALE_REVIEW**.
- CLOSED con obligación UNKNOWN → **imposible**.
- Declaration desde OPEN / STALE → **rechazada**.

## Submission (`FiscalSubmissionAttempt.status`)

| STATE | ENTRA DESDE | SALE HACIA | BLOQUEADORES | DATOS PERSISTIDOS |
|-------|-------------|------------|--------------|-------------------|
| PREPARED | (reservado) | USER_ACTION_REQUIRED | — | attempt row |
| USER_ACTION_REQUIRED | prepare asistido | ACCEPTED (manual), PAYMENT_REQUIRED | stale declaration | attempt + fingerprint |
| PAYMENT_REQUIRED | (asistido / futuro API) | USER_ACTION_REQUIRED / ACCEPTED | NRC pendiente | paymentRequirement |
| SUBMITTING | (solo si hubiera API) | ACCEPTED / REJECTED / TECHNICAL_ERROR / UNKNOWN | — | no usado en v1 |
| ACCEPTED | registro MANUAL_AEAT explícito | — (idempotente) | ya ACCEPTED | receiptId, filingId |
| REJECTED | (futuro AEAT) | PROCEED nuevo intento | — | errorCode seguro |
| TECHNICAL_ERROR | (futuro) | retry controlado | — | errorCode |
| SUBMISSION_STATUS_UNKNOWN | pérdida de respuesta | reconcile antes de retry | — | — |

### Inválidas

- ACCEPTED sin justificante / registro manual → **prohibido** en v1.
- Doble ACCEPTED misma clave idempotencia → **bloqueado**.
- submit automático a Sede → **no existe**.
