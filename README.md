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
reservado). Campos preparados para
Veri*Factu: huella SHA-256 encadenada + QR tributario en PDF (modalidad no verificable; remisión AEAT pendiente).
