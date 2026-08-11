/**
 * Sella facturas existentes sin huella Veri*Factu, en orden cronológico.
 *
 * Uso: npx tsx scripts/backfill-verifactu.ts
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
import { applyVerifactuSeal } from "../lib/verifactu-seal";

async function main() {
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { not: "ANULADA" },
      verifactuHash: null,
    },
    orderBy: [{ issueDate: "asc" }, { createdAt: "asc" }, { number: "asc" }],
    select: { id: true, fullNumber: true },
  });
  console.log(`A sellar: ${invoices.length}`);
  let ok = 0;
  for (const inv of invoices) {
    const res = await applyVerifactuSeal(prisma, inv.id);
    if (res?.hash) {
      ok += 1;
      console.log(`  ${inv.fullNumber} → ${res.hash.slice(0, 12)}…`);
    } else {
      console.log(`  skip ${inv.fullNumber}`);
    }
  }
  console.log(`Selladas: ${ok}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
