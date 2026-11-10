"use client";

import { useActionState } from "react";
import { ButtonPending } from "@/components/ui/ButtonPending";
import type { VerifactuSettingsState } from "@/app/(app)/fiscal/verifactu/actions";
import type { VerifactuEnv, VerifactuMode } from "@/lib/verifactu";

type Props = {
  mode: VerifactuMode;
  env: VerifactuEnv;
  action: (
    prev: VerifactuSettingsState,
    formData: FormData
  ) => Promise<VerifactuSettingsState>;
};

export function VerifactuModeForm({ mode, env, action }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const enabled = mode === "VERIFACTU";

  return (
    <form action={formAction} className="space-y-4">
      <div className="rounded-lg border border-line bg-line/20 px-4 py-3">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-[var(--accent)]"
            name="verifactuEnabled"
            value="1"
            defaultChecked={enabled}
          />
          <span>
            <span className="block text-sm font-medium text-ink">
              Activar Veri*Factu
            </span>
            <span className="mt-0.5 block text-xs text-ink-muted">
              Desactivado: facturas sin huella ni QR (se pueden corregir).
              Activado: sello local en cada emisión y cola de remisión AEAT.
            </span>
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="verifactuEnv">
            Entorno AEAT
          </label>
          <select
            id="verifactuEnv"
            name="verifactuEnv"
            className="input"
            defaultValue={env}
          >
            <option value="TEST">TEST (pruebas)</option>
            <option value="PROD">PROD (producción)</option>
          </select>
        </div>
        <button type="submit" className="btn-primary text-sm" disabled={pending}>
          <ButtonPending
            pending={pending}
            idle="Guardar"
            busy="Guardando…"
          />
        </button>
        {state.success ? (
          <span className="text-sm text-success">Guardado</span>
        ) : null}
        {state.error ? (
          <span className="text-sm text-danger">{state.error}</span>
        ) : null}
      </div>
    </form>
  );
}
