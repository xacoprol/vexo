/**
 * Rellena NIF/NIF-IVA conocidos y corrige AIB de Bambulab si iba a 0%.
 * Usage: npm run backfill:expense-nifs
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

const APPLE_IE = "IE9700053D";
const BAMBULAB_DE = "DE360354704";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function isAppleName(name: string): boolean {
  return name.toLowerCase().includes("apple");
}

function isBambulab(name: string): boolean {
  return /bambulab/i.test(name);
}

function isAnysphere(name: string): boolean {
  return /anysphere|cursor/i.test(name);
}

async function reclassifyImportServices() {
  const rows = await prisma.expense.findMany({
    where: {
      OR: [
        { supplierName: { contains: "Anysphere", mode: "insensitive" } },
        { supplierName: { contains: "Cursor", mode: "insensitive" } },
      ],
      vatOperationType: "INTERIOR",
    },
  });
  let n = 0;
  for (const e of rows) {
    if (!isAnysphere(e.supplierName)) continue;
    const sub = Number(e.subtotal) || Number(e.total);
    const vatRate = 21;
    const vatAmount = round2(sub * (vatRate / 100));
    await prisma.expense.update({
      where: { id: e.id },
      data: {
        vatOperationType: "SERVICIO_EXTRACOMUNITARIO",
        vatRate,
        vatAmount,
        total: round2(sub),
        category: e.category === "OTROS" ? "SOFTWARE" : e.category,
        deductible: true,
      },
    });
    n += 1;
    console.log(
      `Extracom → ${e.issueDate.toISOString().slice(0, 10)} ${e.supplierName} base=${sub} cuota=${vatAmount}: ${e.id}`
    );
  }
  return n;
}

async function main() {
  const importServices = await reclassifyImportServices();

  const missing = await prisma.expense.findMany({
    where: {
      OR: [{ supplierNif: null }, { supplierNif: "" }],
    },
  });

  let apple = 0;
  let bambu = 0;
  let bambuVatFixed = 0;

  for (const e of missing) {
    if (isAppleName(e.supplierName)) {
      await prisma.expense.update({
        where: { id: e.id },
        data: { supplierNif: APPLE_IE },
      });
      apple += 1;
      console.log(`Apple → ${APPLE_IE}: ${e.supplierName} (${e.id})`);
      continue;
    }

    if (isBambulab(e.supplierName)) {
      const sub = Number(e.subtotal);
      const data: {
        supplierNif: string;
        vatRate?: number;
        vatAmount?: number;
        total?: number;
        vatOperationType?: string;
      } = {
        supplierNif: BAMBULAB_DE,
        vatOperationType: "INTRACOMUNITARIA",
      };
      if (
        e.vatOperationType === "INTRACOMUNITARIA" &&
        Number(e.vatAmount) === 0 &&
        sub > 0
      ) {
        const vatRate = e.vatRate > 0 ? e.vatRate : 21;
        data.vatRate = vatRate;
        data.vatAmount = round2(sub * (vatRate / 100));
        data.total = sub;
        bambuVatFixed += 1;
      }
      await prisma.expense.update({ where: { id: e.id }, data });
      bambu += 1;
      console.log(
        `Bambulab → ${BAMBULAB_DE}${data.vatAmount != null ? ` + AIB ${data.vatAmount}€` : ""}: ${e.id}`
      );
    }
  }

  const still = await prisma.expense.count({
    where: {
      OR: [{ supplierNif: null }, { supplierNif: "" }],
      vatOperationType: { in: ["INTERIOR", "INTRACOMUNITARIA"] },
    },
  });

  console.log("\nResumen:");
  console.log(`  Cursor/Anysphere → extracom: ${importServices}`);
  console.log(`  Apple (IE): ${apple}`);
  console.log(`  Bambulab (DE): ${bambu} (AIB corregido: ${bambuVatFixed})`);
  console.log(`  Siguen sin NIF: ${still}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
