"use client";

import { useActionState } from "react";
import type { CompanySettings, InvoiceSeries, QuoteSeries } from "@prisma/client";
import {
  updateSettings,
  createInvoiceSeries,
  type SettingsState,
} from "@/app/(app)/settings/actions";
import { THEME_FIELDS, DEFAULT_THEME } from "@/lib/theme";
import { LogoUploadField } from "@/components/settings/LogoUploadField";
import { ButtonPending } from "@/components/ui/ButtonPending";

type Props = {
  settings: CompanySettings;
  invoiceSeries: InvoiceSeries[];
  quoteSeries: QuoteSeries[];
};

export function SettingsForm({ settings, invoiceSeries, quoteSeries }: Props) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    updateSettings,
    {}
  );

  return (
    <div className="space-y-10">
      <form action={formAction} className="space-y-6">
        {state.error && (
          <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
            Ajustes guardados
          </p>
        )}

        <section className="card-panel space-y-4 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Datos fiscales del emisor
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="name">
                Nombre / Razón social
              </label>
              <input
                id="name"
                name="name"
                className="input"
                defaultValue={settings.name}
                placeholder="Nombre fiscal"
              />
            </div>
            <div>
              <label className="label" htmlFor="companyName">
                Empresa
              </label>
              <input
                id="companyName"
                name="companyName"
                className="input"
                defaultValue={settings.companyName}
                placeholder="Nombre comercial"
              />
            </div>
            <div>
              <label className="label" htmlFor="nif">
                NIF / CIF
              </label>
              <input
                id="nif"
                name="nif"
                className="input font-mono"
                defaultValue={settings.nif}
              />
            </div>
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                className="input"
                defaultValue={settings.email}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="addressStreet">
                Calle
              </label>
              <input
                id="addressStreet"
                name="addressStreet"
                className="input"
                defaultValue={settings.addressStreet}
              />
            </div>
            <div>
              <label className="label" htmlFor="addressCity">
                Ciudad
              </label>
              <input
                id="addressCity"
                name="addressCity"
                className="input"
                defaultValue={settings.addressCity}
              />
            </div>
            <div>
              <label className="label" htmlFor="addressProvince">
                Provincia
              </label>
              <input
                id="addressProvince"
                name="addressProvince"
                className="input"
                defaultValue={settings.addressProvince}
              />
            </div>
            <div>
              <label className="label" htmlFor="addressZip">
                C.P.
              </label>
              <input
                id="addressZip"
                name="addressZip"
                className="input"
                defaultValue={settings.addressZip}
              />
            </div>
            <div>
              <label className="label" htmlFor="addressCountry">
                País
              </label>
              <input
                id="addressCountry"
                name="addressCountry"
                className="input"
                defaultValue={settings.addressCountry}
              />
            </div>
            <div>
              <label className="label" htmlFor="phone">
                Teléfono
              </label>
              <input
                id="phone"
                name="phone"
                className="input"
                defaultValue={settings.phone}
              />
            </div>
            <LogoUploadField currentLogoUrl={settings.logoUrl} />
            <div>
              <label className="label" htmlFor="bankName">
                Banco
              </label>
              <input
                id="bankName"
                name="bankName"
                className="input"
                defaultValue={settings.bankName ?? ""}
              />
            </div>
            <div>
              <label className="label" htmlFor="bankIban">
                IBAN
              </label>
              <input
                id="bankIban"
                name="bankIban"
                className="input font-mono"
                defaultValue={settings.bankIban ?? ""}
              />
            </div>
            <div>
              <label className="label" htmlFor="bizumPhone">
                Teléfono Bizum
              </label>
              <input
                id="bizumPhone"
                name="bizumPhone"
                className="input font-mono"
                defaultValue={settings.bizumPhone ?? "603024030"}
                placeholder="603024030"
              />
              <p className="mt-1 text-xs text-ink-muted">
                Se muestra en facturas si el método de pago es Bizum
              </p>
            </div>
          </div>
        </section>

        <section className="card-panel space-y-4 p-6">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
              Apariencia · UX
            </h2>
            <p className="mt-1 text-xs text-ink-muted">
              Colores de la interfaz Vexo. Se aplican al guardar.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {THEME_FIELDS.map((field) => {
              const value =
                (settings[field.key] as string | undefined) ??
                DEFAULT_THEME[field.key];
              return (
                <div key={field.key}>
                  <label className="label" htmlFor={field.key}>
                    {field.label}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      id={`${field.key}-picker`}
                      className="h-10 w-12 cursor-pointer rounded-md border border-line bg-bg-elevated p-1"
                      defaultValue={value}
                      onChange={(e) => {
                        const text = document.getElementById(
                          field.key
                        ) as HTMLInputElement | null;
                        if (text) text.value = e.target.value;
                      }}
                    />
                    <input
                      id={field.key}
                      name={field.key}
                      className="input font-mono uppercase"
                      defaultValue={value}
                      pattern="^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$"
                      onChange={(e) => {
                        const picker = document.getElementById(
                          `${field.key}-picker`
                        ) as HTMLInputElement | null;
                        if (picker && /^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                          picker.value = e.target.value;
                        }
                      }}
                    />
                  </div>
                  {field.hint && (
                    <p className="mt-1 text-[11px] text-ink-muted">{field.hint}</p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <span className="badge bg-accent text-white">Acento</span>
            <span className="badge bg-accent-soft text-accent">Suave</span>
            <span className="badge border border-line bg-bg-elevated text-ink">
              Superficie
            </span>
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() => {
                for (const field of THEME_FIELDS) {
                  const def = DEFAULT_THEME[field.key];
                  const text = document.getElementById(
                    field.key
                  ) as HTMLInputElement | null;
                  const picker = document.getElementById(
                    `${field.key}-picker`
                  ) as HTMLInputElement | null;
                  if (text) text.value = def;
                  if (picker) picker.value = def;
                }
              }}
            >
              Restaurar colores por defecto
            </button>
          </div>
        </section>

        <section className="card-panel space-y-4 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Impuestos por defecto
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="defaultVatRate">
                IVA por defecto (%)
              </label>
              <select
                id="defaultVatRate"
                name="defaultVatRate"
                className="input"
                defaultValue={settings.defaultVatRate}
              >
                {[21, 10, 4, 0].map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="defaultIrpfRate">
                IRPF por defecto (%)
              </label>
              <select
                id="defaultIrpfRate"
                name="defaultIrpfRate"
                className="input"
                defaultValue={settings.defaultIrpfRate}
              >
                {[0, 7, 15].map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="fiscalRegime">
                Régimen IRPF (autónomo)
              </label>
              <select
                id="fiscalRegime"
                name="fiscalRegime"
                className="input max-w-md"
                defaultValue={settings.fiscalRegime ?? "130"}
              >
                <option value="130">
                  Modelo 130 — estimación directa
                </option>
                <option value="131">Modelo 131 — módulos / estimación objetiva</option>
              </select>
              <p className="mt-1 text-xs text-ink-muted">
                Define qué borrador muestra el módulo Fiscal. La mayoría de
                autónomos de servicios usan 130.
              </p>
            </div>
          </div>
        </section>

        <section className="card-panel space-y-4 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Shopify · sync pedidos
          </h2>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-ink-muted">
            <li>
              Entra en{" "}
              <a
                href="https://dev.shopify.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="text-accent underline"
              >
                Dev Dashboard
              </a>{" "}
              (con la misma cuenta de la tienda).
            </li>
            <li>
              <strong>Apps → Create app</strong> → en Versions añade scope{" "}
              <code className="font-mono">read_orders</code>, App URL{" "}
              <code className="font-mono">
                https://shopify.dev/apps/default-app-home
              </code>{" "}
              y <strong>Release</strong>.
            </li>
            <li>
              Instala la app en tu tienda (Home → Install) y copia Client ID +
              Secret en Settings de la app.
            </li>
          </ol>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="shopifyShop">
                Tienda (.myshopify.com)
              </label>
              <input
                id="shopifyShop"
                name="shopifyShop"
                className="input font-mono"
                defaultValue={settings.shopifyShop ?? ""}
                placeholder="wod3d.myshopify.com"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="label" htmlFor="shopifyClientId">
                Client ID
              </label>
              <input
                id="shopifyClientId"
                name="shopifyClientId"
                className="input font-mono"
                defaultValue={settings.shopifyClientId ?? ""}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="label" htmlFor="shopifyClientSecret">
                Client secret
              </label>
              <input
                id="shopifyClientSecret"
                name="shopifyClientSecret"
                type="password"
                className="input font-mono"
                placeholder={
                  settings.shopifyClientSecret
                    ? "•••••••• (vacío = no cambiar)"
                    : "shpss_…"
                }
                autoComplete="new-password"
              />
              {settings.shopifyClientSecret ? (
                <label className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
                  <input
                    type="checkbox"
                    name="clearShopifySecret"
                    value="1"
                    className="rounded border-line"
                  />
                  Borrar secret guardado
                </label>
              ) : null}
            </div>
          </div>
          {settings.shopifyLastSyncAt ? (
            <p className="text-xs text-ink-muted">
              Última sync:{" "}
              {new Date(settings.shopifyLastSyncAt).toLocaleString("es-ES")}
            </p>
          ) : null}
        </section>

        <section className="card-panel space-y-4 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Plantilla de email
          </h2>
          <p className="text-xs text-ink-muted">
            Variables: {"{{number}}"} (nº documento), {"{{company}}"} (empresa),{" "}
            {"{{client}}"} (nombre del cliente), {"{{contact}}"} (persona de
            contacto; si no hay, usa el nombre del cliente)
          </p>
          <div>
            <label className="label" htmlFor="emailSubject">
              Asunto
            </label>
            <input
              id="emailSubject"
              name="emailSubject"
              className="input"
              defaultValue={settings.emailSubject}
            />
          </div>
          <div>
            <label className="label" htmlFor="emailBody">
              Cuerpo
            </label>
            <textarea
              id="emailBody"
              name="emailBody"
              rows={4}
              className="input"
              defaultValue={settings.emailBody}
            />
          </div>
        </section>

        <section className="card-panel space-y-4 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Recordatorios fiscales (AEAT)
          </h2>
          <p className="text-xs text-ink-muted">
            Email automático 14 días antes, 3 días antes y el día del plazo
            (303, 130, 349, 390, 347). No se envía si el modelo ya está en
            Presentados. Cron diario a las 09:00 UTC.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="fiscalReminderEnabled"
              value="1"
              defaultChecked={settings.fiscalReminderEnabled ?? true}
              className="rounded border-line"
            />
            Activar recordatorios fiscales
          </label>
          <div>
            <label className="label" htmlFor="fiscalReminderEmail">
              Email destino (opcional)
            </label>
            <input
              id="fiscalReminderEmail"
              name="fiscalReminderEmail"
              type="email"
              className="input"
              placeholder={settings.email || "usa el email de la empresa"}
              defaultValue={settings.fiscalReminderEmail ?? ""}
            />
            <p className="mt-1 text-xs text-ink-muted">
              Si lo dejas vacío, se usa el email de la empresa de arriba.
            </p>
          </div>
        </section>

        <section className="card-panel space-y-4 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Recordatorios de cobro
          </h2>
          <p className="text-xs text-ink-muted">
            Variables extra: {"{{total}}"}, {"{{remaining}}"}, {"{{dueDate}}"}.
            El cron diario envía como máximo 1 email/día por factura.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="reminderEnabled"
              value="1"
              defaultChecked={settings.reminderEnabled}
              className="rounded border-line"
            />
            Activar envío automático (cron)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="reminderOnOverdue"
              value="1"
              defaultChecked={settings.reminderOnOverdue}
              className="rounded border-line"
            />
            Recordar también facturas vencidas (máx. 1 cada 7 días)
          </label>
          <div className="max-w-xs">
            <label className="label" htmlFor="reminderDaysBefore">
              Días antes del vencimiento
            </label>
            <input
              id="reminderDaysBefore"
              name="reminderDaysBefore"
              type="number"
              min={0}
              max={60}
              className="input"
              defaultValue={settings.reminderDaysBefore}
            />
          </div>
          <div>
            <label className="label" htmlFor="reminderSubject">
              Asunto recordatorio
            </label>
            <input
              id="reminderSubject"
              name="reminderSubject"
              className="input"
              defaultValue={settings.reminderSubject}
            />
          </div>
          <div>
            <label className="label" htmlFor="reminderBody">
              Cuerpo recordatorio
            </label>
            <textarea
              id="reminderBody"
              name="reminderBody"
              rows={5}
              className="input"
              defaultValue={settings.reminderBody}
            />
          </div>
        </section>

        <button type="submit" disabled={pending} className="btn-primary">
          <ButtonPending
            pending={pending}
            idle="Guardar ajustes"
            busy="Guardando…"
          />
        </button>
      </form>

      <section className="card-panel space-y-4 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Series de numeración
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium">Facturas</h3>
            <ul className="mb-4 space-y-1 text-sm">
              {invoiceSeries.map((s) => (
                <li key={s.id} className="flex justify-between font-mono text-xs">
                  <span>
                    {s.prefix}
                    {s.year ? `${s.year}-` : ""}
                    {String(s.nextNumber).padStart(s.padLength, "0")}
                    {s.isDefault ? " ★" : ""}
                  </span>
                  <span className="text-ink-muted">{s.name}</span>
                </li>
              ))}
            </ul>
            <form action={createInvoiceSeries} className="flex flex-wrap gap-2">
              <input
                name="prefix"
                className="input w-24"
                placeholder="B-"
                required
              />
              <input
                name="name"
                className="input flex-1"
                placeholder="Nombre serie"
                required
              />
              <label className="flex items-center gap-1 text-xs text-ink-muted">
                <input type="checkbox" name="useYear" defaultChecked /> Año
              </label>
              <button type="submit" className="btn-secondary">
                Añadir
              </button>
            </form>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">Presupuestos</h3>
            <ul className="space-y-1 text-sm">
              {quoteSeries.map((s) => (
                <li key={s.id} className="flex justify-between font-mono text-xs">
                  <span>
                    {s.prefix}
                    {s.year ? `${s.year}-` : ""}
                    {String(s.nextNumber).padStart(s.padLength, "0")}
                  </span>
                  <span className="text-ink-muted">{s.name}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
