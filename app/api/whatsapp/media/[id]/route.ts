import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { downloadWhatsappMedia } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/** Sirve un adjunto recibido por WhatsApp (solo con sesión iniciada). */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const msg = await prisma.whatsappMessage.findFirst({
    where: { mediaId: id },
    select: { mediaFilename: true, mediaMime: true },
  });
  if (!msg) return new Response("Not found", { status: 404 });

  try {
    const media = await downloadWhatsappMedia(id);
    const download = req.nextUrl.searchParams.get("download") === "1";
    const filename = (msg.mediaFilename || `whatsapp-${id}`).replace(/["\r\n]/g, "");
    return new Response(media.body, {
      headers: {
        "Content-Type": msg.mediaMime || media.mime,
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (err) {
    return new Response(
      err instanceof Error ? err.message : "No se pudo descargar el adjunto",
      { status: 502 }
    );
  }
}
