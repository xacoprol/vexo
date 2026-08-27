# Limitaciones conocidas — núcleo fiscal v1

- **Sin API AEAT directa** — presentación ASSISTED (Sede) + registro MANUAL_AEAT. 0 network calls a AEAT.
- **Sin serializer BOE/TGVI exacto** — no se genera fichero oficial aproximado (130/303/349).
- **Single-tenant** — `CompanySettings` singleton; soft-tenant por NIF, sin RLS multi-empresa.
- **Sin RBAC fino** — usuario autenticado = `FISCAL_ADMIN`; no roles lector/editor.
- **Filing legacy OCR** — comparación `LEGACY_LIMITED`; no reconstrucción de snapshot; no false MATCH.
- **Apple / marketplace** — datos insuficientes → MANUAL_REVIEW; no auto-resolución.
- **Shopify UE** — reclasificación requiere confirmación de usuario; no auto en 2T real.
- **Rectificativas / complementarias** — fuera de v1.
- **Modelos anuales** (180/190/347/390) — motores parciales; no condicionan CLOSED trimestral.
- **OCR ≠ snapshot** — import gestoría no sustituye freeze VEXO.
- **NRC / pagos** — registro manual; VEXO no genera NRC ni domicilia.
- **Estado periodo `FILED`** — existe en el tipo; el resolver de periodo usa CLOSED cuando todos REQUIRED están filed; `FILED` aplica por modelo.
- **Certificados** — no se almacenan; autenticación solo en Sede del usuario.
- **Concurrencia freeze** — CAS por hashes; dos freezes → supersede del anterior (no dos vigentes).
- **Timezone** — `quarterRange` usa Date local del runtime; desplegar con TZ Europe/Madrid recomendado.
