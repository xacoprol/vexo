# AEAT submission strategy (VEXO Fase 16)

Fuentes: Sede electrónica AEAT (`sede.agenciatributaria.gob.es`).  
**No hay API REST/SOAP pública** de terceros para presentar 130/303/349/111/115.

## Matriz de capacidad

| Modelo | Canal oficial | API/WS | Fichero | Form web | Certificado / Cl@ve | NRC | Automatizable en VEXO | Fuente |
|--------|---------------|--------|---------|----------|---------------------|-----|----------------------|--------|
| 130 | Sede: formulario + import fichero diseño registro (.130) | No | Sí (diseño registro / BOE) | Sí | Sí | Si a ingresar (salvo domiciliación) | No (sin WS) | [Presentación 130](https://sede.agenciatributaria.gob.es/Sede/ayuda/consultas-informaticas/presentacion-declaraciones-ayuda-tecnica/modelo-130/presentacion-electronica-modelo-130.html), [diseño dr130](https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/ant_100_199/archivos/dr130.08.pdf) |
| 303 | Pre303 + form web + import fichero | No | Sí | Sí (Pre303) | Sí | Si a ingresar | No | [Pre303](https://sede.agenciatributaria.gob.es/Sede/iva/pre-303.html), [303 form](https://sede.agenciatributaria.gob.es/Sede/ayuda/consultas-informaticas/presentacion-declaraciones-ayuda-tecnica/modelo-303.html), [303 fichero](https://sede.agenciatributaria.gob.es/Sede/ayuda/consultas-informaticas/presentacion-declaraciones-ayuda-tecnica/modelo-303/presentacion-electronica-modelo-303-fichero.html) |
| 349 | Formulario (≤40k regs) o TGVI online (fichero) | No | Sí (diseño registro Orden HAC/174/2020) | Sí | Sí | No (informativo) | No | [GI28](https://sede.agenciatributaria.gob.es/Sede/procedimientoini/GI28.shtml), [TGVI fichero](https://sede.agenciatributaria.gob.es/Sede/ayuda/consultas-informaticas/declaraciones-informativas-ayuda-tecnica/modelos-349-720/modelo-349-presentacion-mediante-fichero.html), [DR 349](https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_300_399/archivos_20/DR_Anexo_349.pdf) |
| 111 | Formulario web (+ export/import) | No | Diseño registro típico | Sí | Sí | Si a ingresar | No | [111](https://sede.agenciatributaria.gob.es/Sede/ayuda/consultas-informaticas/presentacion-declaraciones-ayuda-tecnica/modelo-111/presentacion-electronica-modelo-111.html) |
| 115 | Formulario web (+ export/import) | No | Diseño registro típico | Sí | Sí | Si a ingresar | No | [115](https://sede.agenciatributaria.gob.es/Sede/ayuda/consultas-informaticas/presentacion-declaraciones-ayuda-tecnica/modelo-115/presentacion-electronica-modelo-115.html) |

### Clasificación VEXO

| Modelo | Capacidad | Estrategia producto |
|--------|-----------|---------------------|
| 130 | `FILE_IMPORT_SUPPORTED` (Sede) / sin API | **ASSISTED** |
| 303 | `FILE_IMPORT_SUPPORTED` (Sede) / sin API | **ASSISTED** |
| 349 | `FILE_IMPORT_SUPPORTED` (TGVI) / sin API | **ASSISTED** (serializer BOE exacto = pendiente; no aproximado) |
| 111 | `ASSISTED_WEB_ONLY` (+ fichero vía form) | **ASSISTED** |
| 115 | `ASSISTED_WEB_ONLY` (+ fichero vía form) | **ASSISTED** |

`DIRECT_API_SUPPORTED`: **ninguno**.

## Autenticación

- **Técnica (Sede):** certificado software / DNIe / Cl@ve (PF).
- **Legitimación:** titular, apoderado, o colaborador social.
- VEXO **no** almacena certificados ni automatiza login.

## Pago / NRC

- Autoliquidaciones a ingresar (130/303/111/115): NRC 22 chars o domiciliación en Sede.
- Fuente: [Qué es NRC](https://sede.agenciatributaria.gob.es/Sede/ayuda/consultas-informaticas/pago-impuestos-deudas-tasas-ayuda-tecnica/que-nrc.html).
- VEXO: contrato `FiscalPaymentRequirement` + registro manual de NRC; **no** genera NRC ni paga.

## Implementado en VEXO

- Capability matrix + adaptadores **asistidos** (prepare → USER_ACTION_REQUIRED).
- Deep-links Sede por modelo.
- Checklist + copia casillas desde declaración congelada.
- `FiscalSubmissionAttempt` (canal `ASSISTED_WEB` / `MANUAL_AEAT`).
- Registro manual de justificante → `FiscalFiling` con lineage PreFiling → Declaration → Filing.
- Flags `FILED_MATCHES_REVIEW` / `FILED_DIFFERS_FROM_REVIEW`.
- **0** llamadas de red a AEAT en esta fase.

## No implementado (a propósito)

- Serializer BOE/TGVI exacto (requiere validación normativa byte-a-byte; no aproximar).
- `submit()` automático.
- Almacenamiento de certificados.
- Sandbox AEAT de modelos (no identificado como API abierta para terceros).

## Cadena trazable

`PreFilingReview` → `FiscalDeclarationDraft` → `FiscalSubmissionAttempt` (asistido) → `FiscalFiling` (manual ACCEPTED).
