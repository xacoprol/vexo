import type { ModeloBoxes } from "@/lib/fiscal";
import { round2 } from "@/lib/modelo-390/money";
import type { Model390Result } from "@/lib/modelo-390/types";

/**
 * @deprecated Adaptador de vista — delega 100 % en `buildModel390Result`.
 * No contiene fórmulas fiscales propias.
 */
export function buildModelo390LegacyAdapter(result: Model390Result): ModeloBoxes {
  const b = result.annualFromOperations.breakdown;
  const volumeOps = round2(
    b.taxableBaseDomestic +
      b.baseExenta +
      b.baseIntracomDeliveries +
      b.baseExport +
      b.baseMarketplaceOss +
      b.importCurrentBase +
      b.importInvestmentBase
  );

  return {
    boxes: [
      {
        code: "99",
        label: "Volumen de operaciones (orientativo)",
        value: volumeOps,
      },
      {
        code: "21",
        label: "Total cuota IVA devengado anual",
        value: result.annualFromOperations.outputVat,
      },
      {
        code: "22",
        label: "Total cuota IVA devengado (alias)",
        value: result.annualFromOperations.outputVat,
      },
      {
        code: "29",
        label: "IVA deducible anual",
        value: result.annualFromOperations.inputVat,
      },
      {
        code: "32",
        label: "Importaciones corrientes (base anual)",
        value: b.importCurrentBase,
      },
      {
        code: "33",
        label: "Importaciones corrientes (cuota anual)",
        value: b.importCurrentVat,
      },
      {
        code: "34",
        label: "Importaciones inversión (base anual)",
        value: b.importInvestmentBase,
      },
      {
        code: "35",
        label: "Importaciones inversión (cuota anual)",
        value: b.importInvestmentVat,
      },
      {
        code: "—",
        label: "Operaciones exentas (base anual)",
        value: b.baseExenta,
      },
      {
        code: "59",
        label: "Entregas intracomunitarias (base anual)",
        value: b.baseIntracomDeliveries,
      },
      {
        code: "60",
        label: "Exportaciones (base anual)",
        value: b.baseExport,
      },
      {
        code: "86",
        label: "Resultado liquidación anual (Σ box71)",
        value: result.annualFromOperations.activityNet,
      },
    ],
    result: result.annualFromOperations.activityNet,
    warnings: result.warnings.map((w) => ({
      code: w.code,
      message: w.message,
      sourceId: w.sourceId,
    })),
  };
}

/** @deprecated Use `buildModelo390LegacyAdapter`. */
export const model390ResultToModeloBoxes = buildModelo390LegacyAdapter;
