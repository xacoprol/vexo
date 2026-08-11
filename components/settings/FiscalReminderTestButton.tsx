"use client";

import { useState, useTransition } from "react";
import { sendFiscalReminderTest } from "@/app/(app)/settings/actions";

export function FiscalReminderTestButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  function send() {
    setMessage(null);
    startTransition(async () => {
      const res = await sendFiscalReminderTest();
      if (res.ok) {
        setMessage({
          ok: true,
          text: `Enviado a ${res.to}. Revisa bandeja (y spam).`,
        });
      } else {
        setMessage({ ok: false, text: res.error });
      }
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="btn-secondary text-sm"
        disabled={pending}
        onClick={send}
      >
        {pending ? "Enviando…" : "Enviar prueba"}
      </button>
      {message ? (
        <p
          className={`text-sm ${
            message.ok ? "text-success" : "text-danger"
          }`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
