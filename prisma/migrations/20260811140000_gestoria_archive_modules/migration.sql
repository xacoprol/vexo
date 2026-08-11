-- Archivo documental
CREATE TABLE "FiscalDocument" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "year" INTEGER,
    "quarter" INTEGER,
    "modelType" TEXT,
    "blobUrl" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sourceFileName" TEXT NOT NULL,
    "notes" TEXT,
    "filingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalDocument_pkey" PRIMARY KEY ("id")
);

-- Libros registro
CREATE TABLE "RegisterBook" (
    "id" TEXT NOT NULL,
    "bookType" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "documentId" TEXT,
    "sourceFile" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegisterBook_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RegisterBookLine" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "reference" TEXT,
    "invoiceNumber" TEXT,
    "issueDate" TIMESTAMP(3),
    "concept" TEXT,
    "nif" TEXT,
    "counterparty" TEXT,
    "base" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "withholding" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total" DECIMAL(65,30) NOT NULL DEFAULT 0,

    CONSTRAINT "RegisterBookLine_pkey" PRIMARY KEY ("id")
);

-- Bienes de inversión
CREATE TABLE "InvestmentAsset" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "supplierName" TEXT,
    "supplierNif" TEXT,
    "invoiceNumber" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "base" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "usefulLifeYears" INTEGER NOT NULL DEFAULT 4,
    "method" TEXT NOT NULL DEFAULT 'LINEAL',
    "startYear" INTEGER,
    "notes" TEXT,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvestmentAmortization" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "InvestmentAmortization_pkey" PRIMARY KEY ("id")
);

-- Pagos / liquidaciones
CREATE TABLE "TaxPayment" (
    "id" TEXT NOT NULL,
    "modelType" TEXT,
    "year" INTEGER,
    "quarter" INTEGER,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "nrc" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PAGADO',
    "documentId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxPayment_pkey" PRIMARY KEY ("id")
);

-- Comunicaciones AEAT
CREATE TABLE "AeatCommunication" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL DEFAULT 'COMUNICACION',
    "subject" TEXT NOT NULL,
    "summary" TEXT,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AeatCommunication_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "FiscalDocument_category_idx" ON "FiscalDocument"("category");
CREATE INDEX "FiscalDocument_year_quarter_idx" ON "FiscalDocument"("year", "quarter");
CREATE INDEX "FiscalDocument_modelType_idx" ON "FiscalDocument"("modelType");
CREATE INDEX "FiscalDocument_filingId_idx" ON "FiscalDocument"("filingId");

CREATE UNIQUE INDEX "RegisterBook_bookType_year_key" ON "RegisterBook"("bookType", "year");
CREATE INDEX "RegisterBook_year_idx" ON "RegisterBook"("year");
CREATE INDEX "RegisterBookLine_bookId_idx" ON "RegisterBookLine"("bookId");
CREATE INDEX "RegisterBookLine_issueDate_idx" ON "RegisterBookLine"("issueDate");

CREATE INDEX "InvestmentAsset_purchaseDate_idx" ON "InvestmentAsset"("purchaseDate");
CREATE INDEX "InvestmentAsset_startYear_idx" ON "InvestmentAsset"("startYear");
CREATE UNIQUE INDEX "InvestmentAmortization_assetId_year_key" ON "InvestmentAmortization"("assetId", "year");
CREATE INDEX "InvestmentAmortization_year_idx" ON "InvestmentAmortization"("year");

CREATE INDEX "TaxPayment_year_quarter_idx" ON "TaxPayment"("year", "quarter");
CREATE INDEX "TaxPayment_modelType_idx" ON "TaxPayment"("modelType");
CREATE INDEX "TaxPayment_paidAt_idx" ON "TaxPayment"("paidAt");

CREATE INDEX "AeatCommunication_occurredAt_idx" ON "AeatCommunication"("occurredAt");
CREATE INDEX "AeatCommunication_kind_idx" ON "AeatCommunication"("kind");

-- FKs
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "FiscalFiling"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RegisterBook" ADD CONSTRAINT "RegisterBook_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "FiscalDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RegisterBookLine" ADD CONSTRAINT "RegisterBookLine_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "RegisterBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvestmentAsset" ADD CONSTRAINT "InvestmentAsset_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "FiscalDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InvestmentAmortization" ADD CONSTRAINT "InvestmentAmortization_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "InvestmentAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaxPayment" ADD CONSTRAINT "TaxPayment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "FiscalDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AeatCommunication" ADD CONSTRAINT "AeatCommunication_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "FiscalDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Limpieza: solo dejar presentados operativos 3T 2026 (trimestrales)
-- Anuales 390/347 se reimportan desde archivo; se borran los trimestrales viejos
DELETE FROM "FiscalFiling"
WHERE "quarter" IS NOT NULL
  AND NOT ("year" = 2026 AND "quarter" = 3);
