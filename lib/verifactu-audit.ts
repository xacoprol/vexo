/**
 * Auditoría de cadena Veri*Factu (hashes locales).
 */
import { prisma } from "@/lib/prisma";

export type VerifactuAuditIssue = {
  code:
    | "MISSING_HASH"
    | "HASH_CHAIN_BREAK"
    | "ANULADA_WITHOUT_EVENT"
    | "PENDING_WITHOUT_MODE"
    | "ORPHAN_PREVIOUS";
  severity: "error" | "warning";
  invoiceId: string;
  fullNumber: string;
  message: string;
};

export type VerifactuAuditReport = {
  checkedAt: Date;
  invoiceCount: number;
  sealedCount: number;
  unsealedCount: number;
  annulledWithoutEvent: number;
  issues: VerifactuAuditIssue[];
};

export async function auditVerifactuChain(): Promise<VerifactuAuditReport> {
  const [invoices, events, settings] = await Promise.all([
    prisma.invoice.findMany({
      select: {
        id: true,
        fullNumber: true,
        status: true,
        verifactuHash: true,
        verifactuPreviousHash: true,
        verifactuRecordAt: true,
        previousInvoiceId: true,
        issueDate: true,
      },
      orderBy: [{ verifactuRecordAt: "asc" }, { createdAt: "asc" }],
    }),
    prisma.verifactuEvent.findMany({
      where: { kind: "ANULACION" },
      select: { invoiceId: true, status: true },
    }),
    prisma.companySettings.findFirst({
      select: { verifactuMode: true },
    }),
  ]);

  const annulEvents = new Set(events.map((e) => e.invoiceId));
  const hashById = new Map(
    invoices
      .filter((i) => i.verifactuHash)
      .map((i) => [i.id, i.verifactuHash as string])
  );

  const issues: VerifactuAuditIssue[] = [];
  let sealedCount = 0;

  // Orden temporal de selladas para comprobar cadena de previousHash
  const sealedOrdered = invoices
    .filter((i) => i.verifactuHash && i.status !== "ANULADA")
    .sort((a, b) => {
      const ta = a.verifactuRecordAt?.getTime() ?? 0;
      const tb = b.verifactuRecordAt?.getTime() ?? 0;
      return ta - tb;
    });

  for (let i = 0; i < sealedOrdered.length; i++) {
    const inv = sealedOrdered[i];
    sealedCount++;
    if (i === 0) continue;
    const prev = sealedOrdered[i - 1];
    const expected = prev.verifactuHash;
    if (
      expected &&
      inv.verifactuPreviousHash &&
      inv.verifactuPreviousHash !== expected
    ) {
      issues.push({
        code: "HASH_CHAIN_BREAK",
        severity: "error",
        invoiceId: inv.id,
        fullNumber: inv.fullNumber,
        message: `Huella anterior no encaja con ${prev.fullNumber} (esperada ${expected.slice(0, 12)}…, tiene ${(inv.verifactuPreviousHash ?? "").slice(0, 12)}…)`,
      });
    }
  }

  for (const inv of invoices) {
    if (inv.status !== "ANULADA" && !inv.verifactuHash) {
      issues.push({
        code: "MISSING_HASH",
        severity: "warning",
        invoiceId: inv.id,
        fullNumber: inv.fullNumber,
        message: "Factura activa sin sello Veri*Factu",
      });
    }
    if (inv.status === "ANULADA" && inv.verifactuHash && !annulEvents.has(inv.id)) {
      issues.push({
        code: "ANULADA_WITHOUT_EVENT",
        severity: "error",
        invoiceId: inv.id,
        fullNumber: inv.fullNumber,
        message: "Anulada con sello previo pero sin evento ANULACION",
      });
    }
    if (
      inv.previousInvoiceId &&
      !hashById.has(inv.previousInvoiceId) &&
      inv.verifactuPreviousHash
    ) {
      // previousInvoiceId apunta a factura sin hash — aviso suave
      issues.push({
        code: "ORPHAN_PREVIOUS",
        severity: "warning",
        invoiceId: inv.id,
        fullNumber: inv.fullNumber,
        message: "previousInvoiceId no tiene huella (posible borrado o histórico)",
      });
    }
  }

  const mode = String(settings?.verifactuMode ?? "NO_VERIFACTU").toUpperCase();
  if (mode === "NO_VERIFACTU") {
    const pending = await prisma.verifactuEvent.count({
      where: { status: { in: ["PENDING", "REJECTED"] } },
    });
    if (pending > 0) {
      issues.push({
        code: "PENDING_WITHOUT_MODE",
        severity: "warning",
        invoiceId: "",
        fullNumber: "—",
        message: `${pending} evento(s) en cola pero el modo es NO_VERIFACTU (no se remitirán)`,
      });
    }
  }

  const unsealedCount = invoices.filter(
    (i) => i.status !== "ANULADA" && !i.verifactuHash
  ).length;
  const annulledWithoutEvent = issues.filter(
    (i) => i.code === "ANULADA_WITHOUT_EVENT"
  ).length;

  return {
    checkedAt: new Date(),
    invoiceCount: invoices.length,
    sealedCount,
    unsealedCount,
    annulledWithoutEvent,
    issues,
  };
}
