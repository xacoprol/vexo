/**
 * Fase 4 — SELECT-only: amort 2026 + meta 349 Q3.
 * Imprime JSON a stdout. No escribe en Neon ni en disco.
 */
import { config as loadEnv } from "dotenv";
import { existsSync } from "fs";

const root = process.cwd();
if (existsSync(`${root}/.env`)) loadEnv({ path: `${root}/.env` });
if (existsSync(`${root}/.env.local`))
  loadEnv({ path: `${root}/.env.local`, override: true });

import { prisma } from "../lib/prisma";
import { quarterRange } from "../lib/fiscal";
import { FISCAL_STATUS } from "../lib/invoice-fiscal-lifecycle";
import { resolveEuVatId } from "../lib/modelo-349/vat-id";

async function main() {
  const amort = await prisma.investmentAmortization.findMany({
    where: { year: 2026 },
    select: {
      amount: true,
      asset: {
        select: {
          id: true,
          description: true,
          purchaseDate: true,
          startYear: true,
          usefulLifeYears: true,
          base: true,
        },
      },
    },
  });

  const q3 = quarterRange(2026, 3);
  const q3Intra = await prisma.invoice.findMany({
    where: {
      issueDate: { gte: q3.from, lte: q3.to },
      vatOperationType: { in: ["INTRACOMUNITARIA", "SERVICIO_INTRACOMUNITARIO"] },
      fiscalStatus: FISCAL_STATUS.ISSUED,
      status: { not: "ANULADA" },
    },
    select: {
      fullNumber: true,
      issueDate: true,
      subtotal: true,
      vatOperationType: true,
      client: { select: { countryCode: true, nif: true } },
    },
  });

  const q3Meta = {
    intraInvoices: q3Intra.map((i) => {
      const vat = resolveEuVatId(i.client?.nif, i.client?.countryCode);
      return {
        number: i.fullNumber,
        date: i.issueDate.toISOString().slice(0, 10),
        subtotal: Number(i.subtotal),
        vatOperationType: i.vatOperationType,
        clientCountry: i.client?.countryCode ?? null,
        vatIdOk: vat.ok,
        vatIdCode: vat.ok ? null : vat.code,
      };
    }),
  };

  console.log(
    "AMORT_JSON",
    JSON.stringify(
      amort.map((r) => ({
        yearAmount: Number(r.amount),
        assetId: r.asset.id,
        desc: r.asset.description?.slice(0, 40) ?? null,
        purchaseDate: r.asset.purchaseDate?.toISOString().slice(0, 10) ?? null,
        startYear: r.asset.startYear,
        usefulLifeYears: r.asset.usefulLifeYears,
        assetBase: Number(r.asset.base),
      }))
    )
  );
  console.log("Q3_JSON", JSON.stringify(q3Meta));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
