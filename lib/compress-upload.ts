/**
 * Compresión en cliente antes de subir facturas (gasto/ingreso).
 * PDF de 1–2 páginas → JPEG (más fiable en Vercel/Gemini).
 * Imágenes → JPEG reescalado. Si el archivo está en Google Drive
 * sin descargar, falla con mensaje claro.
 */

/** Umbral por debajo del cual no tocamos imágenes. */
const SKIP_IMAGE_UNDER_BYTES = 700_000;
/** Techo seguro para el body de Vercel (~4.5 MB). */
const TARGET_MAX_BYTES = 3_200_000;
const IMAGE_MAX_EDGE = 1800;
const IMAGE_QUALITY_STEPS = [0.82, 0.72, 0.62, 0.52, 0.42];
const PDF_MAX_EDGE = 1400;
const PDF_JPEG_QUALITY = 0.7;
const PDF_MAX_PAGES = 12;
const READ_TIMEOUT_MS = 25_000;

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

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Lee el File entero; detecta Google Drive / iCloud no descargados. */
export async function readUploadBytes(file: File): Promise<Uint8Array> {
  try {
    const ab = await withTimeout(
      file.arrayBuffer(),
      READ_TIMEOUT_MS,
      "No se pudo leer el archivo a tiempo. Si está en Google Drive o iCloud, descárgalo primero a Descargas y vuelve a subirlo."
    );
    return new Uint8Array(ab);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/drive|icloud|timed? ?out|network|abort/i.test(msg)) {
      throw new Error(
        "No se pudo leer el archivo. Descárgalo a Descargas (fuera de Google Drive/iCloud) y súbelo otra vez."
      );
    }
    throw err instanceof Error
      ? err
      : new Error("No se pudo leer el archivo seleccionado");
  }
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

async function renderPdfPagesToCanvases(
  data: Uint8Array
): Promise<HTMLCanvasElement[]> {
  const pdfjs = await import("pdfjs-dist");

  // CDN: el worker empaquetado con import.meta.url suele fallar en Vercel.
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data: data.slice() }).promise;
  } catch {
    // Sin worker (más lento, más compatible).
    pdf = await pdfjs.getDocument({
      data: data.slice(),
      // @ts-expect-error — opción soportada en runtime
      disableWorker: true,
      useWorkerFetch: false,
      isEvalSupported: false,
    }).promise;
  }

  const pageCount = Math.min(pdf.numPages, PDF_MAX_PAGES);
  const canvases: HTMLCanvasElement[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const viewport0 = page.getViewport({ scale: 1 });
    const scale = Math.min(
      1.75,
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
    canvases.push(canvas);
  }

  return canvases;
}

async function jpegFromCanvas(
  canvas: HTMLCanvasElement,
  quality = PDF_JPEG_QUALITY
): Promise<Blob> {
  let jpeg = await canvasToJpegBlob(canvas, quality);
  if (jpeg.size > 1_500_000) {
    jpeg = await canvasToJpegBlob(canvas, 0.52);
  }
  if (jpeg.size > TARGET_MAX_BYTES) {
    jpeg = await canvasToJpegBlob(canvas, 0.4);
  }
  return jpeg;
}

/**
 * PDF → JPEG (1 página) o PDF reconstruido con JPEGs (varias).
 * Siempre intenta transformar: los PDF de Drive/escáner fallan menos como JPG.
 */
async function compressPdfFile(file: File, bytes: Uint8Array): Promise<File> {
  const canvases = await renderPdfPagesToCanvases(bytes);

  // 1 página → JPG (más rápido de subir y de leer con Gemini).
  if (canvases.length === 1) {
    const jpeg = await jpegFromCanvas(canvases[0]);
    return new File([jpeg], replaceExt(file.name, ".jpg"), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  }

  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();

  for (const canvas of canvases) {
    const jpeg = await jpegFromCanvas(canvas);
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

  const saved = await out.save({ useObjectStreams: true });
  const ab = saved.buffer.slice(
    saved.byteOffset,
    saved.byteOffset + saved.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([ab], { type: "application/pdf" });

  if (blob.size >= file.size * 0.98) {
    // Mejor enviar la 1ª página como JPG que un PDF enorme.
    const jpeg = await jpegFromCanvas(canvases[0], 0.65);
    return new File([jpeg], replaceExt(file.name, "-p1.jpg"), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  }

  return new File([blob], replaceExt(file.name, ".pdf"), {
    type: "application/pdf",
    lastModified: file.lastModified,
  });
}

/**
 * Comprime el archivo en el navegador antes del upload.
 * Si falla la lectura (Drive), lanza. Si falla solo la compresión, usa original.
 */
export async function compressUploadFile(file: File): Promise<CompressedUpload> {
  const originalBytes = file.size;
  const bytes = await readUploadBytes(file);

  try {
    let out = file;

    if (isPdfFile(file)) {
      out = await compressPdfFile(file, bytes);
    } else if (isImageFile(file) && file.size > SKIP_IMAGE_UNDER_BYTES) {
      out = await compressImageFile(file);
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
      compressed: out.size < originalBytes || out.type !== file.type,
      originalBytes,
      finalBytes: out.size,
    };
  } catch (err) {
    // Errores de lectura (Drive/iCloud) no se tragan: hay que avisar.
    if (
      err instanceof Error &&
      /descárgalo|Google Drive|iCloud|leer el archivo/i.test(err.message)
    ) {
      throw err;
    }
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
