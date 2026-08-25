"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { createClientQuick } from "@/app/(app)/clients/actions";
import { COUNTRY_OPTIONS, countryNameFromCode } from "@/lib/nif";

type CreatedClient = {
  id: string;
  name: string;
  nif?: string | null;
  email?: string | null;
  countryCode?: string | null;
};

type Props = {
  open: boolean;
  initialName?: string;
  onClose: () => void;
  onCreated: (client: CreatedClient) => void;
};

export function CreateClientModal({
  open,
  initialName = "",
  onClose,
  onCreated,
}: Props) {
  const formId = useId();
  const [mounted, setMounted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [countryCode, setCountryCode] = useState("ES");
  const [addressCountry, setAddressCountry] = useState("España");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFieldErrors({});
    setCountryCode("ES");
    setAddressCountry("España");
  }, [open]);

  if (!open || !mounted) return null;

  function err(field: string) {
    return fieldErrors[field] ? (
      <p className="mt-1 text-xs text-danger">{fieldErrors[field]}</p>
    ) : null;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    const form = e.currentTarget;
    const formData = new FormData(form);
    setError(null);
    setFieldErrors({});
    startTransition(() => {
      void createClientQuick(formData).then((res) => {
        if (!res.ok) {
          setFieldErrors(res.fieldErrors ?? {});
          setError(res.error ?? "Revisa los campos");
          return;
        }
        onCreated(res.client);
        onClose();
      });
    });
  }

  // Portal fuera del <form> del presupuesto/factura: un <form> anidado
  // es HTML inválido y en móvil el submit acaba en el documento padre.
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${formId}-title`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="card-panel max-h-[90vh] w-full max-w-lg overflow-y-auto p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2
              id={`${formId}-title`}
              className="text-lg font-semibold tracking-tight"
            >
              Nuevo cliente
            </h2>
            <p className="mt-0.5 text-sm text-ink-muted">
              Se asignará automáticamente al documento
            </p>
          </div>
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-sm"
            onClick={onClose}
            disabled={pending}
          >
            Cerrar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && !Object.keys(fieldErrors).length ? (
            <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <div>
            <label className="label" htmlFor={`${formId}-name`}>
              Nombre / Razón social
            </label>
            <input
              id={`${formId}-name`}
              name="name"
              className="input"
              required
              defaultValue={initialName}
              autoFocus
            />
            {err("name")}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={`${formId}-nif`}>
                NIF / CIF / VAT
              </label>
              <input
                id={`${formId}-nif`}
                name="nif"
                className="input font-mono"
                required
                placeholder="B12345678"
              />
              {err("nif")}
            </div>
            <div>
              <label className="label" htmlFor={`${formId}-country`}>
                País fiscal
              </label>
              <select
                id={`${formId}-country`}
                name="countryCode"
                className="input"
                value={countryCode}
                onChange={(e) => {
                  const code = e.target.value;
                  setCountryCode(code);
                  if (code !== "OTHER") {
                    setAddressCountry(countryNameFromCode(code));
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
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={`${formId}-email`}>
                Email
              </label>
              <input
                id={`${formId}-email`}
                name="email"
                type="email"
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor={`${formId}-phone`}>
                Teléfono
              </label>
              <input id={`${formId}-phone`} name="phone" className="input" />
            </div>
          </div>

          <div>
            <label className="label" htmlFor={`${formId}-street`}>
              Calle
            </label>
            <input
              id={`${formId}-street`}
              name="addressStreet"
              className="input"
              required
            />
            {err("addressStreet")}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor={`${formId}-city`}>
                Ciudad
              </label>
              <input
                id={`${formId}-city`}
                name="addressCity"
                className="input"
                required
              />
              {err("addressCity")}
            </div>
            <div>
              <label className="label" htmlFor={`${formId}-province`}>
                Provincia
              </label>
              <input
                id={`${formId}-province`}
                name="addressProvince"
                className="input"
                required
              />
              {err("addressProvince")}
            </div>
            <div>
              <label className="label" htmlFor={`${formId}-zip`}>
                C.P.
              </label>
              <input
                id={`${formId}-zip`}
                name="addressZip"
                className="input"
                required
              />
              {err("addressZip")}
            </div>
          </div>

          <input type="hidden" name="addressCountry" value={addressCountry} />

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={pending}
            >
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? "Creando…" : "Crear y asignar"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
