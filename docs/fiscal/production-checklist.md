# Checklist producción — fiscal v1 (no desplegar desde este doc)

## Migraciones

- [ ] `prisma migrate deploy` incluye hasta `20260827210000_fiscal_phase16_submission_attempt`
- [ ] `prisma generate` en build
- [ ] Verificar tablas: `FiscalPreFilingReview`, `FiscalSubmissionAttempt`, withholdings, leases

## Env vars

- [ ] `DATABASE_URL` (Neon)
- [ ] NextAuth secrets (`AUTH_SECRET` / providers)
- [ ] Blob storage si se archivan PDF fiscales
- [ ] **No** variables de certificado AEAT / claves privadas en frontend

## Permisos

- [ ] Solo usuarios de confianza (single-tenant admin)
- [ ] Revisar que mutaciones fiscales usan `requireAuth`
- [ ] Soft-tenant NIF coherente en CompanySettings

## Jobs / cron

- [ ] Recordatorios plazo (`FiscalReminderLog`) si están activos
- [ ] No cron de envío AEAT (no existe)

## Backups

- [ ] Backup Neon / point-in-time
- [ ] Tratar `FiscalFiling` + `FiscalPreFilingReview` + attempts como auditoría

## Logs / monitoring

- [ ] No loguear NIF completos, NRC, certificados, payloads íntegros
- [ ] Alertas error rate Server Actions `/fiscal/*`
- [ ] Health check app + DB

## Feature flags

- [ ] Ninguno obligatorio para núcleo v1 assisted
- [ ] No habilitar “submit AEAT” inventado

## Rollback

- [ ] Revert deploy app sin borrar filings
- [ ] No borrar migraciones aplicadas; forward-fix only
- [ ] Freezes/filings históricos inmutables conceptualmente

## Post-deploy smoke

- [ ] `/fiscal/health` carga
- [ ] `/fiscal/close` carga
- [ ] 2T real sigue NOT_READY/OPEN si censo incompleto (no false CLOSED)
- [ ] Suite tests en CI
