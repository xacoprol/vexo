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

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="label" htmlFor="verifactuMode">
          Modo
        </label>
        <select
          id="verifactuMode"
          name="verifactuMode"
          className="input"
          defaultValue={mode}
        >
          <option value="NO_VERIFACTU">NO_VERIFACTU (solo sello local)</option>
          <option value="VERIFACTU">VERIFACTU (cola remisión)</option>
        </select>
      </div>
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
          <option value="TEST">TEST</option>
          <option value="PROD">PROD</option>
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
    </form>
  );
}
