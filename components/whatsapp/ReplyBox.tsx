"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendWhatsappReply } from "@/app/(app)/whatsapp/actions";
import { WA_UNREAD_EVENT } from "@/components/whatsapp/WhatsappLive";

export function ReplyBox({
  phone,
  windowOpen,
  windowEndsLabel,
  configured,
}: {
  phone: string;
  windowOpen: boolean;
  /** «hasta mañana a las 10:32», ya formateado en el servidor */
  windowEndsLabel: string | null;
  configured: boolean;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!configured) {
    return (
      <p className="border-t border-line px-4 py-3 text-sm text-ink-muted">
        Para responder desde aquí falta configurar WhatsApp (Ajustes → Estado de
        integraciones).
      </p>
    );
  }

  if (!windowOpen) {
    return (
      <div className="border-t border-line px-4 py-3 text-sm text-ink-muted">
        <p>
          <span className="font-medium text-ink">Ventana de 24 h cerrada.</span>{" "}
          WhatsApp solo deja escribir libremente durante las 24 h siguientes al
          último mensaje del cliente. Para retomar, reenvía el documento desde
          el presupuesto o la factura (usa la plantilla aprobada) o contesta
          desde el móvil.
        </p>
      </div>
    );
  }

  function submit() {
    const body = text.trim();
    if (!body || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await sendWhatsappReply(phone, body);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setText("");
      window.dispatchEvent(new Event(WA_UNREAD_EVENT));
      router.refresh();
    });
  }

  return (
    <form
      className="space-y-2 border-t border-line px-3 py-3 sm:px-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {error ? (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      ) : null}
      <div className="flex items-end gap-2">
        <label htmlFor="wa-reply" className="sr-only">
          Mensaje
        </label>
        <textarea
          id="wa-reply"
          className="input max-h-40 min-h-[2.75rem] resize-y"
          rows={1}
          placeholder="Escribe una respuesta…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          disabled={pending}
        />
        <button
          type="submit"
          className="btn-primary h-[2.75rem] shrink-0"
          disabled={pending || !text.trim()}
        >
          {pending ? "Enviando…" : "Enviar"}
        </button>
      </div>
      {windowEndsLabel ? (
        <p className="text-xs text-ink-muted">
          Puedes escribirle libremente {windowEndsLabel}. Intro envía, Mayús+Intro
          hace salto de línea.
        </p>
      ) : null}
    </form>
  );
}
