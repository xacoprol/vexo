import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDocumentTemplatePayload,
  describeWhatsappError,
  fillWhatsappPreview,
  normalizeWhatsappPhone,
  sanitizeTemplateParam,
} from "../whatsapp";

describe("whatsapp", () => {
  it("normaliza móviles españoles sin prefijo", () => {
    assert.equal(normalizeWhatsappPhone("612 34 56 78"), "34612345678");
    assert.equal(normalizeWhatsappPhone("612-345-678", "ES"), "34612345678");
    assert.equal(normalizeWhatsappPhone("34612345678", "ES"), "34612345678");
  });

  it("respeta prefijos internacionales", () => {
    assert.equal(normalizeWhatsappPhone("+34 612 345 678"), "34612345678");
    assert.equal(normalizeWhatsappPhone("0034612345678"), "34612345678");
    assert.equal(normalizeWhatsappPhone("+351 912 345 678", "ES"), "351912345678");
    assert.equal(normalizeWhatsappPhone("+44 7700 900123", "ES"), "447700900123");
  });

  it("usa el país del cliente si no hay prefijo", () => {
    assert.equal(normalizeWhatsappPhone("912 345 678", "PT"), "351912345678");
    assert.equal(normalizeWhatsappPhone("06 12 34 56 78", "FR"), "33612345678");
  });

  it("rechaza teléfonos no interpretables", () => {
    assert.equal(normalizeWhatsappPhone(""), null);
    assert.equal(normalizeWhatsappPhone(null), null);
    assert.equal(normalizeWhatsappPhone("12345", "ES"), null);
    assert.equal(normalizeWhatsappPhone("612345678 ext 2", "ES"), null);
    assert.equal(normalizeWhatsappPhone("612345678", "ZZ"), null);
  });

  it("limpia variables de plantilla", () => {
    assert.equal(sanitizeTemplateParam("Ana\n García\t  S.L."), "Ana García S.L.");
    assert.equal(sanitizeTemplateParam("   "), "-");
  });

  it("monta la plantilla con el PDF en la cabecera", () => {
    const payload = buildDocumentTemplatePayload({
      to: "34612345678",
      templateName: "envio_documento",
      templateLang: "es",
      mediaId: "MEDIA1",
      filename: "F-2026-001.pdf",
      bodyParams: ["Ana", "la factura", "F-2026-001", "Vexo"],
    });
    assert.equal(payload.to, "34612345678");
    assert.equal(payload.template.name, "envio_documento");
    assert.deepEqual(payload.template.components[0], {
      type: "header",
      parameters: [
        { type: "document", document: { id: "MEDIA1", filename: "F-2026-001.pdf" } },
      ],
    });
    assert.equal(payload.template.components[1].parameters.length, 4);
  });

  it("rellena la vista previa", () => {
    const text = fillWhatsappPreview(["Ana", "la factura", "F-2026-001", "Vexo"]);
    assert.match(text, /^Hola Ana, te enviamos la factura nº F-2026-001 de Vexo/);
    assert.doesNotMatch(text, /\{\{/);
  });

  it("traduce errores habituales de Meta", () => {
    const cfg = { templateName: "envio_documento", templateLang: "es" };
    assert.match(describeWhatsappError({ code: 190 }, 401, cfg), /token/i);
    assert.match(describeWhatsappError({ code: 132001 }, 404, cfg), /envio_documento/);
    assert.match(describeWhatsappError(undefined, 500, cfg), /HTTP 500/);
  });
});
