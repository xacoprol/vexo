import Link from "next/link";
import type { ReactNode } from "react";
import {
  isWhatsappConfigured,
  isWhatsappInboxConfigured,
} from "@/lib/whatsapp";
import {
  getWhatsappContact,
  getWhatsappThread,
  listWhatsappConversations,
  type WaConversation,
} from "@/lib/whatsapp-inbox";
import { serviceWindowEndsAt } from "@/lib/whatsapp-webhook";
import {
  formatWaClock,
  formatWaDay,
  formatWaPhone,
  formatWaTime,
  waDayKey,
  waSnippet,
} from "@/lib/whatsapp-format";
import { ReplyBox } from "@/components/whatsapp/ReplyBox";
import {
  ThreadScroller,
  WhatsappAutoRefresh,
} from "@/components/whatsapp/WhatsappLive";

export const dynamic = "force-dynamic";

type ThreadMessage = Awaited<ReturnType<typeof getWhatsappThread>>[number];

function href(params: { c?: string | null; q?: string | null }) {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.c) sp.set("c", params.c);
  const s = sp.toString();
  return s ? `/whatsapp?${s}` : "/whatsapp";
}

function Ticks({ status }: { status: string }) {
  if (status === "failed") {
    return <span className="font-semibold text-danger" title="No entregado">!</span>;
  }
  const label =
    status === "read"
      ? "Leído"
      : status === "delivered"
        ? "Entregado"
        : status === "sent"
          ? "Enviado"
          : "Aceptado por WhatsApp";
  const double = status === "read" || status === "delivered";
  return (
    <span
      className={status === "read" ? "text-sky-500" : "text-ink-muted"}
      title={label}
      aria-label={label}
    >
      {double ? "✓✓" : "✓"}
    </span>
  );
}

function ConversationRow({
  c,
  active,
  q,
}: {
  c: WaConversation;
  active: boolean;
  q?: string;
}) {
  return (
    <li>
      <Link
        href={href({ c: c.phone, q })}
        className={`flex gap-3 border-b border-line/60 px-4 py-3 transition ${
          active ? "bg-accent-soft/70" : "hover:bg-accent-soft/40"
        }`}
      >
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent"
        >
          {(c.name?.trim()[0] ?? "#").toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span
              className={`truncate text-sm ${c.unread ? "font-semibold text-ink" : "font-medium text-ink"}`}
            >
              {c.name ?? formatWaPhone(c.phone)}
            </span>
            <span
              className={`shrink-0 text-xs ${c.unread ? "font-semibold text-success" : "text-ink-muted"}`}
            >
              {formatWaTime(c.lastAt)}
            </span>
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span className="truncate text-xs text-ink-muted">
              {c.last.direction === "OUT" ? (
                <>
                  <Ticks status={c.last.status} />{" "}
                </>
              ) : null}
              {waSnippet(c.last)}
            </span>
            {c.unread ? (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-success px-1.5 text-[11px] font-semibold text-white">
                {c.unread}
              </span>
            ) : null}
          </span>
          {c.name ? null : (
            <span className="sr-only">Sin cliente asociado</span>
          )}
        </span>
      </Link>
    </li>
  );
}

function MediaBlock({ m }: { m: ThreadMessage }) {
  if (!m.mediaId) return null;
  const src = `/api/whatsapp/media/${encodeURIComponent(m.mediaId)}`;
  if (m.type === "image" || m.type === "sticker") {
    return (
      <a href={src} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={m.body ?? "Imagen recibida"}
          loading="lazy"
          className={`rounded-lg ${m.type === "sticker" ? "h-28 w-28 object-contain" : "max-h-72 w-auto max-w-full object-cover"}`}
        />
      </a>
    );
  }
  if (m.type === "audio") {
    return <audio controls preload="none" src={src} className="w-64 max-w-full" />;
  }
  if (m.type === "video") {
    return (
      <video controls preload="none" src={src} className="max-h-72 max-w-full rounded-lg" />
    );
  }
  return (
    <a
      href={`${src}?download=1`}
      className="flex items-center gap-2 rounded-lg border border-line bg-bg-elevated px-3 py-2 text-sm hover:border-accent"
    >
      <span aria-hidden>📄</span>
      <span className="truncate">{m.mediaFilename ?? "Documento"}</span>
    </a>
  );
}

function DocLink({ m }: { m: ThreadMessage }) {
  const link = m.quoteId
    ? `/quotes/${m.quoteId}`
    : m.invoiceId
      ? `/invoices/${m.invoiceId}`
      : null;
  if (!m.docLabel) return null;
  const inner = (
    <span className="flex items-center gap-2">
      <span aria-hidden>📄</span>
      <span className="font-medium">{m.docLabel}</span>
    </span>
  );
  return link ? (
    <Link
      href={link}
      className="mb-1.5 block rounded-lg border border-line bg-bg-elevated px-3 py-2 text-sm hover:border-accent"
    >
      {inner}
    </Link>
  ) : (
    <div className="mb-1.5 rounded-lg border border-line bg-bg-elevated px-3 py-2 text-sm">
      {inner}
    </div>
  );
}

function Bubble({
  m,
  quoted,
}: {
  m: ThreadMessage;
  quoted: ThreadMessage | undefined;
}) {
  const out = m.direction === "OUT";

  if (m.type === "reaction") {
    return (
      <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
        <p className="rounded-full bg-bg-elevated px-3 py-1 text-xs text-ink-muted shadow-sm">
          {out ? "Reaccionaste" : "Reaccionó"} {m.body}
          {quoted ? ` a «${waSnippet(quoted).slice(0, 40)}»` : ""}
        </p>
      </div>
    );
  }

  return (
    <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm sm:max-w-[70%] ${
          out
            ? "rounded-br-sm bg-accent-soft text-ink"
            : "rounded-bl-sm border border-line bg-bg-elevated text-ink"
        }`}
      >
        {quoted ? (
          <p className="mb-1.5 truncate border-l-2 border-accent/60 pl-2 text-xs text-ink-muted">
            {waSnippet(quoted)}
          </p>
        ) : null}
        <DocLink m={m} />
        <MediaBlock m={m} />
        {m.body ? (
          <p className={`whitespace-pre-wrap break-words ${m.mediaId ? "mt-1.5" : ""}`}>
            {m.body}
          </p>
        ) : !m.mediaId && !m.docLabel ? (
          <p className="italic text-ink-muted">Mensaje sin contenido visible</p>
        ) : null}
        {m.status === "failed" && m.errorText ? (
          <p className="mt-1 text-xs text-danger">No entregado: {m.errorText}</p>
        ) : null}
        <p className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-ink-muted">
          {out && m.origin === "APP" ? <span>desde el móvil ·</span> : null}
          <span>{formatWaClock(m.sentAt)}</span>
          {out ? <Ticks status={m.status} /> : null}
        </p>
      </div>
    </div>
  );
}

async function Thread({ phone, q }: { phone: string; q?: string }) {
  const [messages, contact] = await Promise.all([
    getWhatsappThread(phone),
    getWhatsappContact(phone),
  ]);

  if (messages.length === 0) {
    return (
      <EmptyState>
        No hay mensajes con {formatWaPhone(phone)}.{" "}
        <Link href={href({ q })} className="text-accent underline">
          Volver a la bandeja
        </Link>
      </EmptyState>
    );
  }

  const byWaId = new Map(
    messages.filter((m) => m.waMessageId).map((m) => [m.waMessageId!, m])
  );
  const unread = messages.filter((m) => m.direction === "IN" && !m.readAt).length;
  const endsAt = serviceWindowEndsAt(contact.lastInboundAt);
  const now = new Date();
  const windowOpen = !!endsAt && endsAt.getTime() > now.getTime();
  const windowEndsLabel =
    windowOpen && endsAt
      ? `hasta ${waDayKey(endsAt) === waDayKey(now) ? "hoy" : "mañana"} a las ${formatWaClock(endsAt)}`
      : null;

  const name = contact.client?.name ?? contact.contactName;
  const startsDay = messages.map(
    (m, i) => i === 0 || waDayKey(m.sentAt) !== waDayKey(messages[i - 1].sentAt)
  );

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Link
          href={href({ q })}
          className="btn-ghost -ml-2 px-2 py-1 md:hidden"
          aria-label="Volver a las conversaciones"
        >
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">
            {name ?? formatWaPhone(phone)}
          </p>
          <p className="truncate text-xs text-ink-muted">
            {formatWaPhone(phone)}
            {contact.client && contact.contactName && contact.contactName !== contact.client.name
              ? ` · WhatsApp: ${contact.contactName}`
              : ""}
          </p>
        </div>
        {contact.client ? (
          <Link href={`/clients/${contact.client.id}`} className="btn-secondary px-3 py-1.5 text-xs">
            Ver cliente
          </Link>
        ) : (
          <span className="badge bg-warning/15 text-warning">Sin cliente</span>
        )}
      </header>

      <ThreadScroller
        phone={phone}
        lastMessageId={messages[messages.length - 1]?.id ?? null}
        unread={unread}
      >
        {messages.map((m, i) => {
          return (
            <div key={m.id}>
              {startsDay[i] ? (
                <p className="py-2 text-center text-xs font-medium first-letter:uppercase text-ink-muted">
                  {formatWaDay(m.sentAt)}
                </p>
              ) : null}
              <Bubble
                m={m}
                quoted={m.contextWaId ? byWaId.get(m.contextWaId) : undefined}
              />
            </div>
          );
        })}
      </ThreadScroller>

      <ReplyBox
        phone={phone}
        windowOpen={windowOpen}
        windowEndsLabel={windowEndsLabel}
        configured={isWhatsappConfigured()}
      />
    </>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-ink-muted">
      <p className="max-w-sm">{children}</p>
    </div>
  );
}

export default async function WhatsappPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const selected = sp.c && /^\d{8,15}$/.test(sp.c) ? sp.c : null;
  const conversations = await listWhatsappConversations(q);
  const inboxReady = isWhatsappInboxConfigured();
  const totalUnread = conversations.reduce((n, c) => n + c.unread, 0);

  return (
    <div className="space-y-4">
      <WhatsappAutoRefresh />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">WhatsApp</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Respuestas de clientes a los presupuestos y facturas que envías
            {totalUnread ? ` · ${totalUnread} sin leer` : ""}
          </p>
        </div>
      </div>

      {!inboxReady ? (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink">
          <p className="font-medium">Aún no se reciben mensajes en Vexo</p>
          <p className="mt-1 text-ink-muted">
            Falta conectar el webhook de Meta: añade{" "}
            <code className="font-mono text-xs">WHATSAPP_WEBHOOK_VERIFY_TOKEN</code> y{" "}
            <code className="font-mono text-xs">WHATSAPP_APP_SECRET</code> en Vercel y
            suscribe la app a la URL{" "}
            <code className="font-mono text-xs">/api/whatsapp/webhook</code>. Pasos
            en <code className="font-mono text-xs">docs/whatsapp.md</code> («Recibir
            respuestas»). Mientras tanto aquí solo verás lo que envías.
          </p>
        </div>
      ) : null}

      <div className="card-panel grid h-[calc(100dvh-14rem)] min-h-[30rem] overflow-hidden md:grid-cols-[21rem_minmax(0,1fr)]">
        <aside
          className={`${selected ? "hidden md:flex" : "flex"} min-h-0 flex-col border-line md:border-r`}
        >
          <form action="/whatsapp" className="border-b border-line p-3">
            {selected ? <input type="hidden" name="c" value={selected} /> : null}
            <label htmlFor="wa-q" className="sr-only">
              Buscar conversación
            </label>
            <input
              id="wa-q"
              name="q"
              defaultValue={q}
              className="input py-2"
              placeholder="Buscar por nombre o teléfono…"
            />
          </form>
          {conversations.length === 0 ? (
            <EmptyState>
              {q
                ? "Ninguna conversación coincide."
                : "Todavía no hay mensajes. Cuando envíes un presupuesto por WhatsApp y el cliente conteste, aparecerá aquí."}
            </EmptyState>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {conversations.map((c) => (
                <ConversationRow key={c.phone} c={c} active={c.phone === selected} q={q} />
              ))}
            </ul>
          )}
        </aside>

        <section className={`${selected ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-col`}>
          {selected ? (
            <Thread phone={selected} q={q} />
          ) : (
            <EmptyState>Elige una conversación para leerla y contestar.</EmptyState>
          )}
        </section>
      </div>
    </div>
  );
}
