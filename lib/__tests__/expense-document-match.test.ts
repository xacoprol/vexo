import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  matchExpenseFileToCandidates,
  matchExpenseFiles,
  type ExpenseAttachCandidate,
} from "../expense-document-match";

const candidates: ExpenseAttachCandidate[] = [
  {
    id: "e1",
    issueDate: "2026-07-31",
    supplierName: "Amazon",
    invoiceNumber: "ES-AEU-2026-653486",
    total: 100,
  },
  {
    id: "e2",
    issueDate: "2026-07-31",
    supplierName: "Amazon",
    invoiceNumber: "ES-AEU-2026-653485",
    total: 50,
  },
  {
    id: "e3",
    issueDate: "2026-06-26",
    supplierName: "MHG",
    invoiceNumber: "0893",
    total: 155,
  },
];

describe("expense-document-match", () => {
  it("empareja por nº factura largo en el nombre", () => {
    const m = matchExpenseFileToCandidates(
      "Invoice-ES-AEU-2026-653486.pdf",
      candidates
    );
    assert.equal(m.expenseId, "e1");
    assert.equal(m.confidence, "high");
  });

  it("no reutiliza el mismo gasto en un lote", () => {
    const matches = matchExpenseFiles(
      ["ES-AEU-2026-653486-a.pdf", "copy-ES-AEU-2026-653486.pdf"],
      candidates
    );
    const ids = matches.map((m) => m.expenseId).filter(Boolean);
    assert.equal(ids.length, 1);
    assert.equal(ids[0], "e1");
  });

  it("sin coincidencia → none", () => {
    const m = matchExpenseFileToCandidates("recibo-random.pdf", candidates);
    assert.equal(m.expenseId, null);
    assert.equal(m.confidence, "none");
  });
});
