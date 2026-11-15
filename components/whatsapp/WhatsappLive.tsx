"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { markWhatsappRead } from "@/app/(app)/whatsapp/actions";

export const WA_UNREAD_EVENT = "vexo:wa-unread";

/** Refresca la bandeja cada pocos segundos mientras la pestaña está visible. */
export function WhatsappAutoRefresh({ intervalMs = 15_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, intervalMs]);
  return null;
}

/**
 * Contenedor del hilo: baja al último mensaje cuando llega uno nuevo y marca
 * la conversación como leída si había mensajes pendientes.
 */
export function ThreadScroller({
  phone,
  lastMessageId,
  unread,
  children,
}: {
  phone: string;
  lastMessageId: string | null;
  unread: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastMessageId, phone]);

  useEffect(() => {
    if (unread <= 0) return;
    let cancelled = false;
    void markWhatsappRead(phone).then(() => {
      if (cancelled) return;
      window.dispatchEvent(new Event(WA_UNREAD_EVENT));
      router.refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [phone, unread, lastMessageId, router]);

  return (
    <div
      ref={ref}
      className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-ink/[0.03] px-3 py-4 sm:px-5"
    >
      {children}
    </div>
  );
}
