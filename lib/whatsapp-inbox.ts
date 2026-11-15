/**
 * Bandeja de WhatsApp: guardar lo que llega por el webhook, registrar lo que
 * envía Vexo y leer conversaciones. Una conversación = un teléfono.
 */
import { prisma } from "@/lib/prisma";
import { normalizeWhatsappPhone } from "@/lib/whatsapp";
import {
  shouldApplyStatus,
  type WaWebhookEvent,
} from "@/lib/whatsapp-webhook";

function isUniqueViolation(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

/** Cliente cuyo teléfono (normalizado con su país) coincide. */
export async function findClientIdByPhone(phone: string): Promise<string | null> {
  const previous = await prisma.whatsappMessage.findFirst({
    where: { phone, clientId: { not: null } },
    orderBy: { sentAt: "desc" },
    select: { clientId: true },
  });
  if (previous?.clientId) return previous.clientId;

  const clients = await prisma.client.findMany({
    where: { phone: { not: null } },
    select: { id: true, phone: true, countryCode: true },
  });
  const hit = clients.find(
    (c) => normalizeWhatsappPhone(c.phone, c.countryCode) === phone
  );
  return hit?.id ?? null;
}

export async function storeWebhookEvents(events: WaWebhookEvent[]): Promise<{
  messages: number;
  statuses: number;
}> {
  let messages = 0;
  let statuses = 0;
  const clientCache = new Map<string, string | null>();

  for (const ev of events) {
    if (ev.kind === "message") {
      const exists = await prisma.whatsappMessage.findUnique({
        where: { waMessageId: ev.waMessageId },
        select: { id: true },
      });
      if (exists) continue;

      if (!clientCache.has(ev.phone)) {
        clientCache.set(ev.phone, await findClientIdByPhone(ev.phone));
      }
      try {
        await prisma.whatsappMessage.create({
          data: {
            waMessageId: ev.waMessageId,
            phone: ev.phone,
            direction: ev.direction,
            origin: ev.origin,
            type: ev.type,
            body: ev.body,
            mediaId: ev.mediaId,
            mediaMime: ev.mediaMime,
            mediaFilename: ev.mediaFilename,
            contextWaId: ev.contextWaId,
            contactName: ev.contactName,
            status: ev.direction === "IN" ? "received" : "sent",
            clientId: clientCache.get(ev.phone) ?? null,
            sentAt: ev.sentAt,
            // Lo que escribes desde el móvil no cuenta como pendiente de leer
            readAt: ev.direction === "OUT" ? ev.sentAt : null,
          },
        });
        messages++;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err; // reintento de Meta
      }
      continue;
    }

    const current = await prisma.whatsappMessage.findUnique({
      where: { waMessageId: ev.waMessageId },
      select: { id: true, status: true },
    });
    if (!current || !shouldApplyStatus(current.status, ev.status)) continue;
    await prisma.whatsappMessage.update({
      where: { id: current.id },
      data: {
        status: ev.status,
        errorText: ev.status === "failed" ? ev.errorText : null,
      },
    });
    statuses++;
  }

  return { messages, statuses };
}

export async function recordOutgoingWhatsapp(data: {
  waMessageId: string;
  phone: string;
  type: "template" | "text";
  body: string;
  clientId?: string | null;
  quoteId?: string | null;
  invoiceId?: string | null;
  docLabel?: string | null;
  contextWaId?: string | null;
}): Promise<void> {
  const now = new Date();
  try {
    await prisma.whatsappMessage.create({
      data: {
        waMessageId: data.waMessageId || null,
        phone: data.phone,
        direction: "OUT",
        origin: "VEXO",
        type: data.type,
        body: data.body,
        status: "accepted",
        clientId: data.clientId ?? (await findClientIdByPhone(data.phone)),
        quoteId: data.quoteId ?? null,
        invoiceId: data.invoiceId ?? null,
        docLabel: data.docLabel ?? null,
        contextWaId: data.contextWaId ?? null,
        sentAt: now,
        readAt: now,
      },
    });
  } catch (err) {
    // Si el webhook de estado llegó antes y no existía la fila, no pasa nada;
    // un duplicado tampoco debe romper el envío.
    if (!isUniqueViolation(err)) console.error("[whatsapp] no se pudo guardar el envío", err);
  }
}

export type WaConversation = {
  phone: string;
  name: string | null;
  clientId: string | null;
  lastAt: Date;
  last: {
    direction: string;
    type: string;
    body: string | null;
    docLabel: string | null;
    mediaFilename: string | null;
    status: string;
  };
  unread: number;
};

export async function listWhatsappConversations(
  query?: string
): Promise<WaConversation[]> {
  const [latest, unread, names, clients] = await Promise.all([
    prisma.whatsappMessage.findMany({
      distinct: ["phone"],
      orderBy: { sentAt: "desc" },
      select: {
        phone: true,
        sentAt: true,
        direction: true,
        type: true,
        body: true,
        docLabel: true,
        mediaFilename: true,
        status: true,
      },
    }),
    prisma.whatsappMessage.groupBy({
      by: ["phone"],
      where: { direction: "IN", readAt: null },
      _count: { _all: true },
    }),
    prisma.whatsappMessage.findMany({
      distinct: ["phone"],
      where: { contactName: { not: null } },
      orderBy: { sentAt: "desc" },
      select: { phone: true, contactName: true },
    }),
    prisma.whatsappMessage.findMany({
      distinct: ["phone"],
      where: { clientId: { not: null } },
      orderBy: { sentAt: "desc" },
      select: { phone: true, client: { select: { id: true, name: true } } },
    }),
  ]);

  const unreadBy = new Map(unread.map((u) => [u.phone, u._count._all]));
  const nameBy = new Map(names.map((n) => [n.phone, n.contactName]));
  const clientBy = new Map(clients.map((c) => [c.phone, c.client]));

  const q = query?.trim().toLowerCase();
  const qDigits = q?.replace(/\D/g, "") ?? "";

  return latest
    .map((m) => {
      const client = clientBy.get(m.phone) ?? null;
      return {
        phone: m.phone,
        name: client?.name ?? nameBy.get(m.phone) ?? null,
        clientId: client?.id ?? null,
        lastAt: m.sentAt,
        last: {
          direction: m.direction,
          type: m.type,
          body: m.body,
          docLabel: m.docLabel,
          mediaFilename: m.mediaFilename,
          status: m.status,
        },
        unread: unreadBy.get(m.phone) ?? 0,
      };
    })
    .filter((c) => {
      if (!q) return true;
      if (c.name?.toLowerCase().includes(q)) return true;
      return qDigits.length >= 3 && c.phone.includes(qDigits);
    });
}

export async function getWhatsappThread(phone: string, limit = 300) {
  const rows = await prisma.whatsappMessage.findMany({
    where: { phone },
    orderBy: { sentAt: "desc" },
    take: limit,
  });
  return rows.reverse();
}

export async function getWhatsappContact(phone: string) {
  const [named, withClient, lastInbound] = await Promise.all([
    prisma.whatsappMessage.findFirst({
      where: { phone, contactName: { not: null } },
      orderBy: { sentAt: "desc" },
      select: { contactName: true },
    }),
    prisma.whatsappMessage.findFirst({
      where: { phone, clientId: { not: null } },
      orderBy: { sentAt: "desc" },
      select: { client: { select: { id: true, name: true } } },
    }),
    prisma.whatsappMessage.findFirst({
      where: { phone, direction: "IN" },
      orderBy: { sentAt: "desc" },
      select: { sentAt: true },
    }),
  ]);
  return {
    contactName: named?.contactName ?? null,
    client: withClient?.client ?? null,
    lastInboundAt: lastInbound?.sentAt ?? null,
  };
}

export async function countUnreadWhatsapp(): Promise<number> {
  return prisma.whatsappMessage.count({
    where: { direction: "IN", readAt: null },
  });
}

export async function markWhatsappConversationRead(phone: string): Promise<number> {
  const res = await prisma.whatsappMessage.updateMany({
    where: { phone, direction: "IN", readAt: null },
    data: { readAt: new Date() },
  });
  return res.count;
}
