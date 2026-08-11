/**
 * Enlaza TaxPayment sin modelo con FiscalFiling por importe (+ year si hay).
 */
import { config as loadEnv } from "dotenv";
import { existsSync } from "fs";
import path from "path";

function loadLocalEnv() {
  const root = process.cwd();
  if (existsSync(path.join(root, ".env"))) loadEnv({ path: path.join(root, ".env") });
  if (existsSync(path.join(root, ".env.local")))
    loadEnv({ path: path.join(root, ".env.local") });
}
loadLocalEnv();

import { prisma } from "../lib/prisma";

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

async function main() {
  const [payments, filings] = await Promise.all([
    prisma.taxPayment.findMany({
      where: {
        amount: { gt: 0 },
        OR: [{ modelType: null }, { filingId: null }],
      },
    }),
    prisma.fiscalFiling.findMany({
      where: { modelType: { in: ["303", "130"] }, result: { gt: 0 } },
      select: {
        id: true,
        periodKey: true,
        modelType: true,
        year: true,
        quarter: true,
        result: true,
      },
    }),
  ]);

  const byAmount = new Map<string, typeof filings>();
  for (const f of filings) {
    const key = round2(Number(f.result)).toFixed(2);
    const list = byAmount.get(key) ?? [];
    list.push(f);
    byAmount.set(key, list);
  }

  let linked = 0;
  for (const pass of ["strict", "amountOnly"] as const) {
    const payments = await prisma.taxPayment.findMany({
      where: {
        amount: { gt: 0 },
        OR: [{ modelType: null }, { filingId: null }],
      },
    });

    for (const p of payments) {
      const key = round2(Number(p.amount)).toFixed(2);
      let candidates = byAmount.get(key) ?? [];
      if (pass === "strict") {
        if (p.year != null) {
          candidates = candidates.filter((f) => f.year === p.year);
        }
        if (p.quarter != null) {
          const qMatch = candidates.filter((f) => f.quarter === p.quarter);
          if (qMatch.length) candidates = qMatch;
        }
      }
      if (candidates.length !== 1) {
        if (pass === "amountOnly") {
          console.log(
            `skip ${key}€ year=${p.year} q=${p.quarter} candidates=${candidates.length}`
          );
        }
        continue;
      }
      const f = candidates[0];
      await prisma.taxPayment.update({
        where: { id: p.id },
        data: {
          modelType: p.modelType ?? f.modelType,
          year: f.year,
          quarter: f.quarter,
          filingId: p.filingId ?? f.id,
        },
      });
      linked += 1;
      console.log(
        `linked ${key}€ → ${f.periodKey}${pass === "amountOnly" ? " (by amount)" : ""}`
      );
    }
  }

  console.log(`\nEnlazados: ${linked}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
