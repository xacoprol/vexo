-- Bandeja de WhatsApp: mensajes entrantes (webhook) y salientes
CREATE TABLE "WhatsappMessage" (
    "id" TEXT NOT NULL,
    "waMessageId" TEXT,
    "phone" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "body" TEXT,
    "mediaId" TEXT,
    "mediaMime" TEXT,
    "mediaFilename" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "errorText" TEXT,
    "contextWaId" TEXT,
    "contactName" TEXT,
    "origin" TEXT,
    "clientId" TEXT,
    "quoteId" TEXT,
    "invoiceId" TEXT,
    "docLabel" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsappMessage_waMessageId_key" ON "WhatsappMessage"("waMessageId");
CREATE INDEX "WhatsappMessage_phone_sentAt_idx" ON "WhatsappMessage"("phone", "sentAt");
CREATE INDEX "WhatsappMessage_direction_readAt_idx" ON "WhatsappMessage"("direction", "readAt");
CREATE INDEX "WhatsappMessage_clientId_idx" ON "WhatsappMessage"("clientId");

ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
