import { buildFiscalPeriodValidation } from "../lib/fiscal-validation";
import { rejectGenerationWhenOpen } from "../lib/fiscal-declaration";
import { prisma } from "../lib/prisma";

async function main() {
  const v = await buildFiscalPeriodValidation({ year: 2026, quarter: 2 });
  const reject =
    v.lifecycle.status !== "READY_FOR_SUBMISSION"
      ? rejectGenerationWhenOpen()
      : ({ ok: true } as const);
  console.log(
    JSON.stringify(
      {
        health: v.health.status,
        lifecycle: v.lifecycle.status,
        readyForSubmission: v.lifecycle.readyForSubmission,
        generation:
          reject.ok === false
            ? "REJECTED_AS_EXPECTED"
            : "UNEXPECTEDLY_ALLOWED",
        reason:
          reject.ok === false
            ? `${reject.error}: ${reject.message}`
            : null,
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
