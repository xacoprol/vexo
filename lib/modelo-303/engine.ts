import {
  computeBox27,
  computeBox45,
  computeModel303Liquidation,
} from "@/lib/modelo-303/liquidation";
import type {
  Model303EngineInput,
  Model303Outcome,
  Model303Result,
} from "@/lib/modelo-303/types";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function bucketAt(
  vatBuckets: Model303EngineInput["vatBuckets"],
  rate: number
) {
  return (
    vatBuckets.find((b) => Math.abs(b.rate - rate) < 0.01) ?? {
      rate,
      base: 0,
      quota: 0,
    }
  );
}

function classifyOutcome(liq: {
  box27: number;
  box45: number;
  box46: number;
  box71: number;
}): Model303Outcome {
  const hasActivity =
    liq.box27 > 0 || liq.box45 > 0 || Math.abs(liq.box46) > 0;
  if (!hasActivity && liq.box71 === 0) return "NO_ACTIVITY";
  if (liq.box71 > 0) return "TO_PAY";
  if (liq.box71 === 0) return "ZERO";
  return "TO_COMPENSATE";
}

const SCOPE_NOTE =
  "VEXO: régimen general ordinario + ISP/AIB. Cas. 16/17 (RE)=0. Cas. 70/108/109 reservadas a rectificativas (=0). " +
  "71 negativa: compensación (devolución no automatizada). box77/box68=0 salvo supuestos no soportados.";

export function buildModel303(input: Model303EngineInput): Model303Result {
  const warnings = [...input.warnings];
  if (input.priorCompensationProvisional) {
    warnings.push({
      code: "PRIOR_FILING_PROVISIONAL",
      message:
        "Compensación de periodos anteriores provisional: falta Modelo 303 presentado del trimestre anterior.",
    });
  }

  const b4 = bucketAt(input.vatBuckets, 4);
  const b10 = bucketAt(input.vatBuckets, 10);
  const b21 = bucketAt(input.vatBuckets, 21);
  const otherBase = round2(
    input.vatBuckets
      .filter((b) => ![4, 10, 21].some((r) => Math.abs(b.rate - r) < 0.01))
      .reduce((s, b) => s + b.base, 0)
  );
  const otherQuota = round2(
    input.vatBuckets
      .filter((b) => ![4, 10, 21].some((r) => Math.abs(b.rate - r) < 0.01))
      .reduce((s, b) => s + b.quota, 0)
  );

  const box01 = round2(b4.base);
  const box02 = 4;
  const box03 = round2(b4.quota);
  const box04 = round2(b10.base);
  const box05 = 10;
  const box06 = round2(b10.quota);
  const box07 = round2(b21.base);
  const box08 = 21;
  const box09 = round2(b21.quota);

  const box10 = round2(Math.max(0, input.euIntracomAccruedBase));
  const box11 = round2(Math.max(0, input.euIntracomAccruedVat));
  const box12 = round2(Math.max(0, input.otherIspAccruedBase));
  const box13 = round2(Math.max(0, input.otherIspAccruedVat));
  const box16 = 0;
  const box17 = 0;

  const box27 = computeBox27({
    box03,
    box06,
    box09,
    box11,
    box13,
    box17,
    otherDevengadoQuota: otherQuota,
  });

  const box28 = round2(Math.max(0, input.domesticDeductibleBase));
  const box29 = round2(
    Math.max(0, input.domesticDeductibleVat + input.otherIspDeductibleVat)
  );
  const box30 = round2(Math.max(0, input.investmentDomesticBase));
  const box31 = round2(Math.max(0, input.investmentDomesticVat));
  const box32 = round2(Math.max(0, input.importCurrentBase));
  const box33 = round2(Math.max(0, input.importCurrentVat));
  const box34 = round2(Math.max(0, input.importInvestmentBase));
  const box35 = round2(Math.max(0, input.importInvestmentVat));
  const box36 = round2(Math.max(0, input.euCurrentDeductibleBase));
  const box37 = round2(Math.max(0, input.euCurrentDeductibleVat));
  const box38 = round2(Math.max(0, input.euInvestmentDeductibleBase));
  const box39 = round2(Math.max(0, input.euInvestmentDeductibleVat));
  const box41 = 0;
  const box42 = 0;
  const box43 = 0;
  const box44 = 0;

  const box45 = computeBox45({
    box29,
    box31,
    box33,
    box35,
    box37,
    box39,
    box41,
    box42,
    box43,
    box44,
  });

  const liq = computeModel303Liquidation(box27, box45, input.priorCompensation);

  const box60 = round2(input.baseExport + input.baseCanarias);
  const box59 = round2(input.baseIntracomDeliveries);
  const box123 = round2(input.baseMarketplaceCollected);

  const boxes = {
    box01,
    box02,
    box03,
    box04,
    box05,
    box06,
    box07,
    box08,
    box09,
    box10,
    box11,
    box12,
    box13,
    box16,
    box17,
    box27,
    box28,
    box29,
    box30,
    box31,
    box32,
    box33,
    box34,
    box35,
    box36,
    box37,
    box38,
    box39,
    box41,
    box42,
    box43,
    box44,
    box45,
    box46: liq.box46,
    box59,
    box60,
    box66: liq.box66,
    box68: liq.box68,
    box69: liq.box69,
    box70: liq.box70,
    box71: liq.box71,
    box77: liq.box77,
    box78: liq.box78,
    box87: liq.box87,
    box108: liq.box108,
    box109: liq.box109,
    box110: liq.box110,
    box123,
    baseExenta: round2(input.baseExenta),
    otherBase,
    otherQuota,
  };

  const outcome = classifyOutcome({
    box27,
    box45,
    box46: liq.box46,
    box71: liq.box71,
  });

  const boxList: Model303Result["boxList"] = [
    { code: "01", label: "Base imponible 4 %", value: boxes.box01 },
    { code: "02", label: "Tipo 4 %", value: boxes.box02 },
    { code: "03", label: "Cuota 4 %", value: boxes.box03 },
    { code: "04", label: "Base imponible 10 %", value: boxes.box04 },
    { code: "05", label: "Tipo 10 %", value: boxes.box05 },
    { code: "06", label: "Cuota 10 %", value: boxes.box06 },
    { code: "07", label: "Base imponible 21 %", value: boxes.box07 },
    { code: "08", label: "Tipo 21 %", value: boxes.box08 },
    { code: "09", label: "Cuota 21 %", value: boxes.box09 },
    {
      code: "10",
      label: "Adq. intracomunitarias bienes y servicios (base)",
      value: boxes.box10,
    },
    {
      code: "11",
      label: "Adq. intracomunitarias bienes y servicios (cuota)",
      value: boxes.box11,
    },
    {
      code: "12",
      label: "Otras operaciones ISP excepto intracom (base)",
      value: boxes.box12,
    },
    {
      code: "13",
      label: "Otras operaciones ISP excepto intracom (cuota)",
      value: boxes.box13,
    },
    {
      code: "16",
      label: "Recargo equivalencia (no soportado)",
      value: boxes.box16,
    },
    {
      code: "17",
      label: "Recargo equivalencia cuota (no soportado)",
      value: boxes.box17,
    },
    ...(otherQuota > 0 || otherBase > 0
      ? [
          {
            code: "revisar",
            label: "Otras bases sujetas (tipos distintos) — revisar en sede",
            value: otherBase,
          },
          {
            code: "revisar",
            label: "Otras cuotas repercutidas — revisar en sede",
            value: otherQuota,
          },
        ]
      : []),
    { code: "27", label: "Total cuota devengada", value: boxes.box27 },
    {
      code: "28",
      label: "Base cuotas soportadas (ops. interiores corrientes)",
      value: boxes.box28,
    },
    { code: "29", label: "Cuota deducible (corrientes + otras ISP)", value: boxes.box29 },
    { code: "30", label: "Base bienes de inversión (interior)", value: boxes.box30 },
    { code: "31", label: "Cuota deducible bienes de inversión (interior)", value: boxes.box31 },
    { code: "32", label: "Importaciones bienes corrientes (base)", value: boxes.box32 },
    { code: "33", label: "Importaciones bienes corrientes (cuota)", value: boxes.box33 },
    {
      code: "34",
      label: "Importaciones bienes de inversión (base)",
      value: boxes.box34,
    },
    {
      code: "35",
      label: "Importaciones bienes de inversión (cuota)",
      value: boxes.box35,
    },
    {
      code: "36",
      label: "AIB corrientes deducible (base)",
      value: boxes.box36,
    },
    { code: "37", label: "AIB corrientes deducible (cuota)", value: boxes.box37 },
    {
      code: "38",
      label: "AIB bienes de inversión deducible (base)",
      value: boxes.box38,
    },
    {
      code: "39",
      label: "AIB bienes de inversión deducible (cuota)",
      value: boxes.box39,
    },
    { code: "45", label: "Total IVA deducible", value: boxes.box45 },
    { code: "46", label: "Resultado régimen general (27 − 45)", value: boxes.box46 },
    { code: "59", label: "Entregas intracomunitarias (base)", value: boxes.box59 },
    {
      code: "60",
      label: "Exportaciones y asimiladas (incl. Canarias)",
      value: boxes.box60,
    },
    {
      code: "revisar",
      label: "Otras operaciones exentas — revisar en sede",
      value: boxes.baseExenta,
    },
    {
      code: "123",
      label: "No sujetas OSS / ventanilla única (marketplace)",
      value: boxes.box123,
    },
    {
      code: "110",
      label: "Cuotas a compensar de periodos anteriores",
      value: boxes.box110,
    },
    {
      code: "78",
      label: "Cuotas anteriores aplicadas en este periodo",
      value: boxes.box78,
    },
    {
      code: "87",
      label: "Compensación periodos anteriores pendiente (110 − 78)",
      value: boxes.box87,
    },
    {
      code: "69",
      label: "Resultado liquidación (66 + 77 − 78 + 68 + 108)",
      value: boxes.box69,
    },
    {
      code: "70",
      label: "Rectificativa: resultado liquidación anterior (ordinaria = 0)",
      value: boxes.box70,
    },
    {
      code: "109",
      label: "Rectificativa: ajuste complementaria (ordinaria = 0)",
      value: boxes.box109,
    },
    {
      code: "71",
      label: "Resultado final autoliquidación (69 − 70 + 109)",
      value: boxes.box71,
    },
  ];

  return {
    boxes,
    boxList,
    result: liq.box71,
    carryForward: liq.totalAvailableNextPeriod,
    currentPeriodNegative: liq.newNegativeBalance,
    priorCompensationPending: liq.box87,
    outcome,
    trace: input.trace,
    warnings,
    scopeNote: SCOPE_NOTE,
  };
}

export function model303ResultToLegacyBoxes(result: Model303Result): {
  boxes: { code: string; label: string; value: number }[];
  result: number;
  carryForward?: number;
  warnings?: Model303Result["warnings"];
  trace?: Model303Result["trace"];
  outcome?: Model303Outcome;
  scopeNote?: string;
} {
  return {
    boxes: result.boxList,
    result: result.result,
    carryForward: result.carryForward,
    warnings: result.warnings,
    trace: result.trace,
    outcome: result.outcome,
    scopeNote: result.scopeNote,
  };
}

export { computeBox27, computeBox45, computeModel303Liquidation } from "@/lib/modelo-303/liquidation";
