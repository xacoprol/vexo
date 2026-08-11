import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  FISCAL_MODEL_TYPES,
  type FiscalModelType,
  type FilingBox,
} from "@/lib/gemini-fiscal-filing";
import {
  FilingEditForm,
  type FilingEditInitial,
} from "@/components/fiscal/FilingEditForm";

function parseBoxes(raw: unknown): FilingBox[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((b) => {
    const o = b as Record<string, unknown>;
    return {
      code: String(o.code ?? "—"),
      label: String(o.label ?? ""),
      value: Number(o.value) || 0,
    };
  });
}

function asModelType(raw: string): FiscalModelType | null {
  return (FISCAL_MODEL_TYPES as string[]).includes(raw)
    ? (raw as FiscalModelType)
    : null;
}

export default async function EditFiscalFilingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const filing = await prisma.fiscalFiling.findUnique({ where: { id } });
  if (!filing) notFound();

  const modelType = asModelType(filing.modelType);
  if (!modelType) notFound();

  const initial: FilingEditInitial = {
    id: filing.id,
    modelType,
    year: filing.year,
    quarter: filing.quarter,
    filedAt: filing.filedAt
      ? filing.filedAt.toISOString().slice(0, 10)
      : null,
    result: Number(filing.result),
    incomeBase: filing.incomeBase != null ? Number(filing.incomeBase) : null,
    expensesBase:
      filing.expensesBase != null ? Number(filing.expensesBase) : null,
    vatRepercutida:
      filing.vatRepercutida != null ? Number(filing.vatRepercutida) : null,
    vatDeductible:
      filing.vatDeductible != null ? Number(filing.vatDeductible) : null,
    boxes: parseBoxes(filing.boxes),
    notes: filing.notes,
    sourceFileName: filing.sourceFileName,
    confidence: filing.confidence,
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/fiscal/filings"
          className="text-sm text-ink-muted hover:text-accent"
        >
          ← Presentados
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Editar {filing.modelType}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Corrige resultado, fechas, bases o casillas sin volver a subir el PDF.
        </p>
      </div>
      <FilingEditForm initial={initial} />
    </div>
  );
}
