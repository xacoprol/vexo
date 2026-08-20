/**
 * Compresión en cliente antes de subir facturas (gasto/ingreso).
 * Objetivo: caber en el límite ~4.5 MB de Vercel Functions y guardar
 * en Blob una copia más ligera sin perder legibilidad para OCR.
 */

/** Umbral por debajo del cual no tocamos el archivo. */
const SKIP_UNDER_BYTES = 700_000;
/** Techo seguro para el body de Vercel (~4.5 MB). */
const TARGET_MAX_BYTES = 3_200_000;
const IMAGE_MAX_EDGE = 1800;
const IMAGE_QUALITY_STEPS = [0.82, 0.72, 0.62, 0.52, 0.42];
const PDF_MAX_EDGE = 1600;
const PDF_JPEG_QUALITY = 0.72;
const PDF_MAX_PAGES = 20;

export type CompressedUpload = {
  file: File;
  compressed: boolean;
  originalBytes: number;
  finalBytes: number;
};

function isImageFile(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  return (
    mime.startsWith("image/") ||
    /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(name)
  );
}

function isPdfFile(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  return mime === "application/pdf" || name.endsWith(".pdf");
}

function replaceExt(name: string, ext: string): string {
  const base = name.replace(/\.[^.]+$/, "") || "documento";
  return `${base}${ext}`;
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen"));
    };
    img.src = url;
  });
}

async function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
  );
  if (!blob) throw new Error("No se pudo comprimir la imagen");
  return blob;
}

async function compressImageFile(file: File): Promise<File> {
  const img = await loadImageElement(file);
  const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  let best: Blob | null = null;
  for (const q of IMAGE_QUALITY_STEPS) {
    const blob = await canvasToJpegBlob(canvas, q);
    best = blob;
    if (blob.size <= TARGET_MAX_BYTES) break;
  }
  if (!best) throw new Error("No se pudo comprimir la imagen");

  if (best.size >= file.size) return file;

  return new File([best], replaceExt(file.name, ".jpg"), {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
}

async function compressPdfFile(file: File): Promise<File> {
  const [{ PDFDocument }, pdfjs] = await Promise.all([
    import("pdf-lib"),
    import("pdfjs-dist"),
  ]);

  // Worker desde el mismo paquete (Next/Turbopack resuelve el URL).
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: data.slice() }).promise;
  const pageCount = Math.min(pdf.numPages, PDF_MAX_PAGES);

  const out = await PDFDocument.create();

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const viewport0 = page.getViewport({ scale: 1 });
    const scale = Math.min(
      2,
      PDF_MAX_EDGE / Math.max(viewport0.width, viewport0.height)
    );
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas no disponible");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    let jpeg = await canvasToJpegBlob(canvas, PDF_JPEG_QUALITY);
    if (jpeg.size > 1_800_000) {
      jpeg = await canvasToJpegBlob(canvas, 0.55);
    }

    const jpgBytes = new Uint8Array(await jpeg.arrayBuffer());
    const embedded = await out.embedJpg(jpgBytes);
    const pdfPage = out.addPage([embedded.width, embedded.height]);
    pdfPage.drawImage(embedded, {
      x: 0,
      y: 0,
      width: embedded.width,
      height: embedded.height,
    });
  }

  const bytes = await out.save({ useObjectStreams: true });
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([ab], { type: "application/pdf" });

  // Si no mejora, mantener original (p. ej. PDF ya optimizado).
  if (blob.size >= file.size * 0.95) return file;

  return new File([blob], replaceExt(file.name, ".pdf"), {
    type: "application/pdf",
    lastModified: file.lastModified,
  });
}

/**
 * Comprime el archivo en el navegador antes del upload.
 * CSV y otros tipos se dejan igual. Si falla la compresión, devuelve el original.
 */
export async function compressUploadFile(file: File): Promise<CompressedUpload> {
  const originalBytes = file.size;

  if (file.size <= SKIP_UNDER_BYTES) {
    return {
      file,
      compressed: false,
      originalBytes,
      finalBytes: file.size,
    };
  }

  try {
    let out = file;
    if (isImageFile(file)) {
      out = await compressImageFile(file);
    } else if (isPdfFile(file)) {
      out = await compressPdfFile(file);
    } else {
      return {
        file,
        compressed: false,
        originalBytes,
        finalBytes: file.size,
      };
    }

    return {
      file: out,
      compressed: out.size < originalBytes,
      originalBytes,
      finalBytes: out.size,
    };
  } catch (err) {
    console.warn("compressUploadFile failed, using original:", err);
    return {
      file,
      compressed: false,
      originalBytes,
      finalBytes: file.size,
    };
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
