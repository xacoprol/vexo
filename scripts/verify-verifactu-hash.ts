/**
 * Vectores unitarios de huella Veri*Factu (regresión local).
 * Ejecutar: npx tsx scripts/verify-verifactu-hash.ts
 */
import {
  buildHuellaAltaCanonical,
  computeHuellaAlta,
  computeHuellaAnulacion,
  formatVerifactuAmount,
  sha256HexUpper,
} from "../lib/verifactu";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const fields = {
  idEmisorFactura: "B12345678",
  numSerieFactura: "W3D2026-001",
  fechaExpedicionFactura: "15-03-2026",
  tipoFactura: "F1",
  cuotaTotal: formatVerifactuAmount(21),
  importeTotal: formatVerifactuAmount(121),
  huellaAnterior: "",
  fechaHoraHusoGenRegistro: "2026-03-15T12:00:00+01:00",
};

const canonical = buildHuellaAltaCanonical(fields);
assert(
  canonical.includes("IDEmisorFactura=B12345678"),
  "canonical debe incluir NIF"
);
assert(canonical.includes("TipoFactura=F1"), "TipoFactura F1");
assert(canonical.includes("CuotaTotal=21.00"), "Cuota 2 decimales");
assert(canonical.includes("ImporteTotal=121.00"), "Importe 2 decimales");

const { huella, canonical: c2 } = computeHuellaAlta(fields);
assert(c2 === canonical, "computeHuellaAlta reutiliza canonical");
assert(/^[0-9A-F]{64}$/.test(huella), "huella SHA-256 hex 64");
assert(huella === sha256HexUpper(canonical), "huella = sha256(canonical)");

// Determinismo
const again = computeHuellaAlta(fields);
assert(again.huella === huella, "misma entrada → misma huella");

// Cadena: segunda factura referencia la anterior
const second = computeHuellaAlta({
  ...fields,
  numSerieFactura: "W3D2026-002",
  huellaAnterior: huella,
});
assert(second.huella !== huella, "factura distinta → huella distinta");
assert(
  second.canonical.includes(`Huella=${huella}`),
  "segunda incluye huella anterior"
);

const anul = computeHuellaAnulacion({
  idEmisorFactura: "B12345678",
  numSerieFactura: "W3D2026-001",
  fechaExpedicionFactura: "15-03-2026",
  huellaAnterior: huella,
  fechaHoraHusoGenRegistro: "2026-03-16T10:00:00+01:00",
});
assert(anul.canonical.includes("TipoFactura=Anulacion"), "anulación tipada");
assert(/^[0-9A-F]{64}$/.test(anul.huella), "huella anulación válida");

console.log("verify-verifactu-hash: OK");
console.log("  alta1:", huella.slice(0, 16) + "…");
console.log("  alta2:", second.huella.slice(0, 16) + "…");
console.log("  anul: ", anul.huella.slice(0, 16) + "…");
