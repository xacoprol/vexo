"use client";

import { useActionState } from "react";
import type { Client } from "@prisma/client";
import {
  createClient,
  updateClient,
  type ClientFormState,
} from "@/app/(app)/clients/actions";
import { COUNTRY_OPTIONS, countryNameFromCode } from "@/lib/nif";
import { ButtonPending } from "@/components/ui/ButtonPending";

type Props = {
  client?: Client;
};

export function ClientForm({ client }: Props) {
  const action = client
    ? updateClient.bind(null, client.id)
    : createClient;

  const [state, formAction, pending] = useActionState<ClientFormState, FormData>(
    action,
    {}
  );

  const err = (field: string) =>
    state.fieldErrors?.[field] ? (
      <p className="mt-1 text-xs text-danger">{state.fieldErrors[field]}</p>
    ) : null;

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="name">
            Nombre / Razón social
          </label>
          <input
            id="name"
            name="name"
            className="input"
            required
            defaultValue={client?.name ?? ""}
          />
          {err("name")}
        </div>
        <div>
          <label className="label" htmlFor="nif">
            NIF / CIF / VAT{" "}
            <span className="font-normal text-ink-muted">(opcional)</span>
          </label>
          <input
            id="nif"
            name="nif"
            className="input font-mono"
            defaultValue={client?.nif ?? ""}
            placeholder="12345678A o 516327372"
          />
          {err("nif")}
        </div>
        <div>
          <label className="label" htmlFor="countryCode">
            País (fiscal)
          </label>
          <select
            id="countryCode"
            name="countryCode"
            className="input"
            defaultValue={client?.countryCode ?? "ES"}
            onChange={(e) => {
              const countryInput = document.getElementById(
                "addressCountry"
              ) as HTMLInputElement | null;
              if (countryInput && e.target.value !== "OTHER") {
                countryInput.value = countryNameFromCode(e.target.value);
              }
            }}
          >
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="contactPerson">
            Persona de contacto
          </label>
          <input
            id="contactPerson"
            name="contactPerson"
            className="input"
            defaultValue={client?.contactPerson ?? ""}
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
            defaultValue={client?.email ?? ""}
          />
        </div>
        <div>
          <label className="label" htmlFor="phone">
            Teléfono móvil
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            className="input"
            required
            defaultValue={client?.phone ?? ""}
            placeholder="600 000 000"
          />
          {err("phone")}
        </div>
      </div>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink">
          Dirección{" "}
          <span className="font-normal text-ink-muted">(opcional)</span>
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="addressStreet">
              Calle
            </label>
            <input
              id="addressStreet"
              name="addressStreet"
              className="input"
              defaultValue={client?.addressStreet ?? ""}
            />
            {err("addressStreet")}
          </div>
          <div>
            <label className="label" htmlFor="addressCity">
              Ciudad
            </label>
            <input
              id="addressCity"
              name="addressCity"
              className="input"
              defaultValue={client?.addressCity ?? ""}
            />
            {err("addressCity")}
          </div>
          <div>
            <label className="label" htmlFor="addressProvince">
              Provincia
            </label>
            <input
              id="addressProvince"
              name="addressProvince"
              className="input"
              defaultValue={client?.addressProvince ?? ""}
            />
            {err("addressProvince")}
          </div>
          <div>
            <label className="label" htmlFor="addressZip">
              Código postal
            </label>
            <input
              id="addressZip"
              name="addressZip"
              className="input"
              defaultValue={client?.addressZip ?? ""}
            />
            {err("addressZip")}
          </div>
          <div>
            <label className="label" htmlFor="addressCountry">
              País
            </label>
            <input
              id="addressCountry"
              name="addressCountry"
              className="input"
              defaultValue={client?.addressCountry ?? "España"}
            />
          </div>
        </div>
      </fieldset>

      <div>
        <label className="label" htmlFor="notes">
          Notas internas
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          className="input"
          defaultValue={client?.notes ?? ""}
        />
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={pending} className="btn-primary">
          <ButtonPending
            pending={pending}
            idle={client ? "Guardar cambios" : "Crear cliente"}
            busy="Guardando…"
          />
        </button>
        <a href="/clients" className="btn-secondary">
          Cancelar
        </a>
      </div>
    </form>
  );
}
