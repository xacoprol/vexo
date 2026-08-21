# Vexo

Panel de facturación para autónomos y pequeñas empresas:
clientes → presupuestos → facturas → facturas recurrentes.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Prisma + SQLite (dev) / PostgreSQL (prod)
- Auth.js (NextAuth v5) — email/password, un usuario por instancia
- `@react-pdf/renderer` para PDF (compatible con serverless)
- Cron vía endpoint HTTP (`/api/cron/generate-recurring-invoices`)

## Arranque

```bash
cp .env.example .env
npm install
npx prisma migrate dev
npm run db:seed
npm run dev
```

Login por defecto (seed):

- Email: `admin@factura.local`
- Contraseña: `admin123`

## Cron de recurrentes

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/generate-recurring-invoices
```

En Vercel, `vercel.json` programa la ejecución diaria a las 06:00 UTC.
Configura `CRON_SECRET` en las variables de entorno.

## Postgres en producción

Cambia en `prisma/schema.prisma`:

```
provider = "postgresql"
```

Y `DATABASE_URL` a tu connection string. El schema es compatible.

## Numeración legal

Las facturas usan series correlativas sin huecos. No se pueden borrar facturas
Las facturas se pueden eliminar; si borras la última de la serie, el número
vuelve a quedar disponible. También puedes anularlas (el número queda
reservado).

## Veri*Factu (RRSIF)

Estado actual:

- **Sello local** al emitir: huella SHA-256 encadenada + QR en PDF
- Modalidad por defecto: **NO_VERIFACTU** (QR no verificable, sin remisión)
- Panel: `/fiscal/verifactu` (auditoría de cadena, cola de eventos, modo)
- Cron: `/api/cron/verifactu-remit` (solo si modo = `VERIFACTU`)

Variables de entorno (remisión):

| Variable | Uso |
|---|---|
| `VERIFACTU_AEAT_ENDPOINT` | Gateway HTTP JSON hacia AEAT / adaptador con certificado |
| `VERIFACTU_AEAT_TOKEN` | Bearer opcional del gateway |
| `VERIFACTU_AEAT_STUB` | `1` (default) simula aceptación; `0` exige endpoint real |

**Certificado electrónico:** no se guarda en el repo ni en Prisma. El gateway
externo (o futuro worker) debe montar el `.p12` / certificado FNMT vía secretos
de Vercel o un HSM. Rotación: actualizar el secreto del gateway, no el código.

Verificación de huellas (regresión):

```bash
npm run verify:verifactu
```

Obligación plena autónomos: **1 jul 2027**. Hasta entonces el sello local + QR
no verificable es el camino operativo; activa `VERIFACTU` en el panel cuando
tengas certificado y endpoint de pruebas.
