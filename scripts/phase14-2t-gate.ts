import { buildFiscalPeriodValidation } from "../lib/fiscal-validation";
import { prisma } from "../lib/prisma";

async function main() {
  const v = await buildFiscalPeriodValidation({ year: 2026, quarter: 2 });
  const settings = await prisma.companySettings.findFirst();
  console.log(
    JSON.stringify(
      {
        nif: settings?.nif,
        health: v.health.status,
        lifecycle: v.lifecycle.status,
        readyToFile: v.lifecycle.readyToFile,
        readyForSubmission: v.lifecycle.readyForSubmission,
        blockers: v.health.blockers.map((b) => `${b.code}:${b.model}`),
        closeActions: (v.closeActions ?? []).slice(0, 15).map((a) => ({
          title: a.title,
          type: a.actionType,
          group: a.group,
          count: a.count,
          href: a.href,
          sev: a.severity,
        })),
        euReviews: v.euReviews,
        unknownModels: v.lifecycle.unknownModels,
      },
      null,
      2
    )
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
