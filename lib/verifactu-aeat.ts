/**
 * Cliente remisión Veri*Factu → AEAT.
 *
 * - TEST + stub (por defecto): simula aceptación (sin certificado).
 * - PROD o endpoint configurado: POST JSON al gateway configurado
 *   (VERIFACTU_AEAT_ENDPOINT). El contrato real SOAP/AEAT se cablea
 *   cuando Jacobo tenga certificado y WSDL vigentes.
 */

import type { VerifactuEnv } from "@/lib/verifactu";

export type AeatRemitPayload = {
  kind: "ALTA" | "ANULACION";
  env: VerifactuEnv;
  issuerNif: string;
  fullNumber: string;
  issueDate: string;
  canonical: string;
  hash: string;
  previousHash: string | null;
  qrUrl: string | null;
  cuotaTotal?: string;
  importeTotal?: string;
};

export type AeatRemitResult = {
  ok: boolean;
  code: string;
  message: string;
  stub?: boolean;
};

function aeatEndpoint(): string | null {
  return process.env.VERIFACTU_AEAT_ENDPOINT?.trim() || null;
}

/** Stub si no hay endpoint; forzar con VERIFACTU_AEAT_STUB=1; desactivar con =0. */
function useStub(endpoint: string | null): boolean {
  const v = process.env.VERIFACTU_AEAT_STUB?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off") return false;
  if (v === "1" || v === "true" || v === "on") return true;
  return !endpoint;
}

/**
 * Remite un evento. Sin endpoint (o stub forzado) simula aceptación.
 * Con VERIFACTU_AEAT_ENDPOINT: POST JSON `{ ok, code, message }`.
 */
export async function remitVerifactuEventToAeat(
  payload: AeatRemitPayload
): Promise<AeatRemitResult> {
  const endpoint = aeatEndpoint();

  if (useStub(endpoint)) {
    if (payload.env === "PROD" && !endpoint) {
      return {
        ok: false,
        code: "NO_ENDPOINT",
        message:
          "Falta VERIFACTU_AEAT_ENDPOINT para remisión en producción (o activa stub solo en TEST)",
      };
    }
    return {
      ok: true,
      code: "STUB_OK",
      message: `Stub AEAT (${payload.env}): ${payload.kind} ${payload.fullNumber} aceptado`,
      stub: true,
    };
  }

  if (!endpoint) {
    return {
      ok: false,
      code: "NO_ENDPOINT",
      message: "Falta VERIFACTU_AEAT_ENDPOINT",
    };
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.VERIFACTU_AEAT_TOKEN
          ? {
              Authorization: `Bearer ${process.env.VERIFACTU_AEAT_TOKEN}`,
            }
          : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25_000),
    });

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return {
        ok: false,
        code: `HTTP_${res.status}`,
        message: `Respuesta no JSON del gateway AEAT (${res.status})`,
      };
    }

    const data = (await res.json()) as {
      ok?: boolean;
      code?: string;
      message?: string;
    };
    return {
      ok: Boolean(data.ok) && res.ok,
      code: data.code ?? `HTTP_${res.status}`,
      message: data.message ?? (res.ok ? "OK" : "Rechazo gateway"),
    };
  } catch (e) {
    return {
      ok: false,
      code: "NETWORK",
      message: e instanceof Error ? e.message : "Error de red al remitir",
    };
  }
}
