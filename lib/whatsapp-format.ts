/** Helpers de presentación de la bandeja de WhatsApp (sin dependencias de servidor). */

export function formatWaPhone(digits: string): string {
  if (/^34\d{9}$/.test(digits)) {
    const n = digits.slice(2);
    return `+34 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  }
  return `+${digits}`;
}

const TYPE_LABEL: Record<string, string> = {
  image: "📷 Foto",
  document: "📄 Documento",
  audio: "🎤 Audio",
  video: "🎬 Vídeo",
  sticker: "Sticker",
  location: "📍 Ubicación",
  contacts: "👤 Contacto",
  template: "📄 Documento enviado",
};

/** Texto corto para la lista de conversaciones. */
export function waSnippet(m: {
  type: string;
  body: string | null;
  docLabel?: string | null;
  mediaFilename?: string | null;
}): string {
  if (m.type === "template" && m.docLabel) return `📄 ${m.docLabel}`;
  if (m.type === "reaction") return `Reaccionó ${m.body ?? ""}`.trim();
  const label = TYPE_LABEL[m.type];
  if (label) {
    const extra = m.body || m.mediaFilename;
    return extra ? `${label} · ${extra}` : label;
  }
  return m.body || "Mensaje";
}

const TZ = "Europe/Madrid";

/** YYYY-MM-DD en hora de Madrid (el servidor de Vercel va en UTC). */
export function waDayKey(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: TZ });
}

export function formatWaClock(d: Date): string {
  return d.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}

/** Hora si es de hoy, «Ayer», o fecha corta. */
export function formatWaTime(d: Date, now = new Date()): string {
  const key = waDayKey(d);
  if (key === waDayKey(now)) return formatWaClock(d);
  if (key === waDayKey(new Date(now.getTime() - 86_400_000))) return "Ayer";
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: key.slice(0, 4) === waDayKey(now).slice(0, 4) ? undefined : "2-digit",
    timeZone: TZ,
  });
}

/** Separador de día dentro del hilo. */
export function formatWaDay(d: Date, now = new Date()): string {
  const key = waDayKey(d);
  if (key === waDayKey(now)) return "Hoy";
  if (key === waDayKey(new Date(now.getTime() - 86_400_000))) return "Ayer";
  return d.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: key.slice(0, 4) === waDayKey(now).slice(0, 4) ? undefined : "numeric",
    timeZone: TZ,
  });
}
