"use client";

import { useActionState, useState } from "react";
import {
  createLease,
  updateLease,
  type LeaseFormState,
} from "@/app/(app)/fiscal/leases/actions";
import { LEASE_EXEMPTION_REASON_LABELS } from "@/lib/fiscal-leases";
import { DateInput } from "@/components/ui/DateInput";
import { ButtonPending } from "@/components/ui/ButtonPending";

type LeaseDraft = {
  id: string;
  landlordName: string;
  landlordNif: string;
  propertyAddress: string;
  postalCode: string | null;
  municipality: string | null;
  province: string | null;
  countryCode: string;
  cadastralReference: string | null;
  startDate: string;
  endDate: string | null;
  activityUse: string;
  withholdingStatus: string;
  withholdingExemptionReason: string | null;
  defaultWithholdingRate: number | null;
  active: boolean;
  notes: string | null;
};

type Props = {
  lease?: LeaseDraft;
};

export function LeaseForm({ lease }: Props) {
  const action = lease ? updateLease.bind(null, lease.id) : createLease;
  const [state, formAction] = useActionState<LeaseFormState, FormData>(
    action,
    {}
  );
  const [withholdingStatus, setWithholdingStatus] = useState(
    lease?.withholdingStatus ?? "UNKNOWN"
  );

  return (
    <form action={formAction} className="card-panel space-y-4 p-4">
      <h2 className="text-lg font-medium">
        {lease ? "Editar local arrendado" : "Nuevo local arrendado"}
      </h2>
      {state.error ? (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="landlordName">
            Arrendador
          </label>
          <input
            id="landlordName"
            name="landlordName"
            required
            defaultValue={lease?.landlordName ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="landlordNif">
            NIF arrendador
          </label>
          <input
            id="landlordNif"
            name="landlordNif"
            defaultValue={lease?.landlordNif ?? ""}
            className="input"
            placeholder="Opcional — sin NIF queda en revisión"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="propertyAddress">
          Dirección del inmueble
        </label>
        <input
          id="propertyAddress"
          name="propertyAddress"
          required
          defaultValue={lease?.propertyAddress ?? ""}
          className="input"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="postalCode">
            CP
          </label>
          <input
            id="postalCode"
            name="postalCode"
            defaultValue={lease?.postalCode ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="municipality">
            Municipio
          </label>
          <input
            id="municipality"
            name="municipality"
            defaultValue={lease?.municipality ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="province">
            Provincia
          </label>
          <input
            id="province"
            name="province"
            defaultValue={lease?.province ?? ""}
            className="input"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="cadastralReference">
          Referencia catastral (opcional)
        </label>
        <input
          id="cadastralReference"
          name="cadastralReference"
          defaultValue={lease?.cadastralReference ?? ""}
          className="input"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="startDate">
            Fecha inicio
          </label>
          <DateInput
            id="startDate"
            name="startDate"
            defaultValue={
              lease?.startDate ?? new Date().toISOString().slice(0, 10)
            }
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="endDate">
            Fecha fin (opcional)
          </label>
          <DateInput
            id="endDate"
            name="endDate"
            defaultValue={lease?.endDate ?? undefined}
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="label">¿Está afecto a tu actividad?</legend>
        {(
          [
            ["FULL", "Sí completamente"],
            ["PARTIAL", "Parcialmente"],
            ["UNKNOWN", "No lo sé"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="activityUse"
              value={value}
              defaultChecked={(lease?.activityUse ?? "UNKNOWN") === value}
            />
            {label}
          </label>
        ))}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="label">¿El alquiler está sujeto a retención?</legend>
        {(
          [
            ["YES", "Sí"],
            ["NO", "No"],
            ["UNKNOWN", "No lo sé"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="withholdingStatus"
              value={value}
              checked={withholdingStatus === value}
              onChange={() => setWithholdingStatus(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>

      {withholdingStatus === "NO" ? (
        <div>
          <label className="label" htmlFor="withholdingExemptionReason">
            Motivo de no retención
          </label>
          <select
            id="withholdingExemptionReason"
            name="withholdingExemptionReason"
            className="input"
            defaultValue={lease?.withholdingExemptionReason ?? ""}
            required
          >
            <option value="">Selecciona…</option>
            {Object.entries(LEASE_EXEMPTION_REASON_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {withholdingStatus === "YES" ? (
        <div>
          <label className="label" htmlFor="defaultWithholdingRate">
            Tipo de retención habitual (%)
          </label>
          <input
            id="defaultWithholdingRate"
            name="defaultWithholdingRate"
            type="number"
            step="0.01"
            min={0}
            defaultValue={lease?.defaultWithholdingRate ?? 19}
            className="input w-32"
          />
          <p className="mt-1 text-xs text-ink-muted">
            Editable por documento; no es una regla legal automática.
          </p>
        </div>
      ) : null}

      <div>
        <label className="label" htmlFor="notes">
          Notas
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={lease?.notes ?? ""}
          className="input"
        />
      </div>

      <input type="hidden" name="countryCode" value={lease?.countryCode ?? "ES"} />
      <input type="hidden" name="active" value={lease?.active === false ? "0" : "1"} />

      <ButtonPending className="btn-primary">
        {lease ? "Guardar" : "Crear local"}
      </ButtonPending>
    </form>
  );
}
