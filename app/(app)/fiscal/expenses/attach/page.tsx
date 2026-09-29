import Link from "next/link";
import { listExpensesMissingDocument } from "@/app/(app)/fiscal/expenses/attach-actions";
import { ExpenseAttachDocuments } from "@/components/fiscal/ExpenseAttachDocuments";

export default async function ExpenseAttachPage() {
  const candidates = await listExpensesMissingDocument();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/fiscal/expenses"
          className="text-sm text-ink-muted hover:text-accent"
        >
          ← Gastos
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Adjuntar facturas a gastos
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Para gastos creados sin PDF: sube los archivos y Vexo los enlaza por
          número de factura en el nombre.
        </p>
      </div>

      {candidates.length === 0 ? (
        <p className="rounded-lg border border-line bg-line/20 px-4 py-6 text-sm text-ink-muted">
          Todos los gastos tienen documento adjunto.
        </p>
      ) : (
        <ExpenseAttachDocuments candidates={candidates} />
      )}
    </div>
  );
}
