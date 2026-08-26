import { prisma } from "./prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

export type NumberAllocation = {
  seriesId: string;
  seriesPrefix: string;
  number: number;
  fullNumber: string;
};

/** Acepta PrismaClient o el cliente de una $transaction. */
type Db = PrismaClient | Prisma.TransactionClient;

function buildFullNumber(
  prefix: string,
  number: number,
  padLength: number,
  year: number | null
): string {
  const padded = String(number).padStart(padLength, "0");
  if (year != null) {
    return `${prefix}${year}-${padded}`;
  }
  return `${prefix}${padded}`;
}

/**
 * Reserva el siguiente número de factura de forma atómica.
 * Debe ejecutarse dentro de una transacción Prisma.
 */
export async function allocateInvoiceNumber(
  tx: Db,
  seriesId?: string
): Promise<{
  seriesId: string;
  seriesPrefix: string;
  number: number;
  fullNumber: string;
}> {
  const series = seriesId
    ? await tx.invoiceSeries.findUniqueOrThrow({ where: { id: seriesId } })
    : await tx.invoiceSeries.findFirstOrThrow({ where: { isDefault: true } });

  const currentYear = new Date().getFullYear();
  let year = series.year;
  let nextNumber = series.nextNumber;

  // Si la serie usa año y cambió el año, reiniciar correlativo
  if (series.year != null && series.year !== currentYear) {
    year = currentYear;
    nextNumber = 1;
  }

  const number = nextNumber;
  const fullNumber = buildFullNumber(
    series.prefix,
    number,
    series.padLength,
    year
  );

  await tx.invoiceSeries.update({
    where: { id: series.id },
    data: {
      nextNumber: number + 1,
      ...(year != null ? { year } : {}),
    },
  });

  return {
    seriesId: series.id,
    seriesPrefix: series.prefix,
    number,
    fullNumber,
  };
}

/**
 * Tras borrar una factura DRAFT, recalcula nextNumber = max(número existente) + 1.
 * Como ISSUED nunca se borra, sus números permanecen en el max → jamás se reutilizan.
 * Si el borrado era el máximo (borrador sin ISSUED superior), el correlativo se recupera.
 */
export async function syncInvoiceSeriesNextNumber(
  tx: Db,
  seriesId: string,
  deletedNumber?: number
): Promise<number> {
  const agg = await tx.invoice.aggregate({
    where: { seriesId },
    _max: { number: true },
  });
  const maxExisting = agg._max.number;
  const nextNumber =
    (maxExisting ?? (deletedNumber != null ? deletedNumber - 1 : 0)) + 1;
  await tx.invoiceSeries.update({
    where: { id: seriesId },
    data: { nextNumber },
  });
  return nextNumber;
}

export async function allocateQuoteNumber(
  tx: Db,
  seriesId?: string
): Promise<{
  seriesId: string;
  seriesPrefix: string;
  number: number;
  fullNumber: string;
}> {
  const series = seriesId
    ? await tx.quoteSeries.findUniqueOrThrow({ where: { id: seriesId } })
    : await tx.quoteSeries.findFirstOrThrow({ where: { isDefault: true } });

  const currentYear = new Date().getFullYear();
  let year = series.year;
  let nextNumber = series.nextNumber;

  if (series.year != null && series.year !== currentYear) {
    year = currentYear;
    nextNumber = 1;
  }

  const number = nextNumber;
  const fullNumber = buildFullNumber(
    series.prefix,
    number,
    series.padLength,
    year
  );

  await tx.quoteSeries.update({
    where: { id: series.id },
    data: {
      nextNumber: number + 1,
      ...(year != null ? { year } : {}),
    },
  });

  return {
    seriesId: series.id,
    seriesPrefix: series.prefix,
    number,
    fullNumber,
  };
}

/** Preview del próximo número sin reservarlo */
export async function previewNextInvoiceNumber(seriesId?: string) {
  const series = seriesId
    ? await prisma.invoiceSeries.findUniqueOrThrow({ where: { id: seriesId } })
    : await prisma.invoiceSeries.findFirstOrThrow({ where: { isDefault: true } });

  const year =
    series.year != null ? new Date().getFullYear() : null;
  const number =
    series.year != null && series.year !== new Date().getFullYear()
      ? 1
      : series.nextNumber;

  return buildFullNumber(series.prefix, number, series.padLength, year ?? series.year);
}

export async function previewNextQuoteNumber(seriesId?: string) {
  const series = seriesId
    ? await prisma.quoteSeries.findUniqueOrThrow({ where: { id: seriesId } })
    : await prisma.quoteSeries.findFirstOrThrow({ where: { isDefault: true } });

  const year =
    series.year != null ? new Date().getFullYear() : null;
  const number =
    series.year != null && series.year !== new Date().getFullYear()
      ? 1
      : series.nextNumber;

  return buildFullNumber(series.prefix, number, series.padLength, year ?? series.year);
}
