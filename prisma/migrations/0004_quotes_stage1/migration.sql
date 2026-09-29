-- Migração 0004 — Ciclo 4 / Sub-etapa 1: Orçamento interno
-- Corresponde exatamente ao schema.prisma (AppSetting, Quote, QuoteVersion,
-- QuoteItem). quote_approvals e quote_access_links vêm na migração 0005
-- (Sub-etapa 2). Ver nota sobre migrações manuais em TECH_DEBT.md (DT1).

CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

INSERT INTO "app_settings" ("key", "value", "updatedAt")
VALUES ('quote_default_validity_days', '7', CURRENT_TIMESTAMP);

CREATE TYPE "QuoteStatus" AS ENUM (
    'RASCUNHO', 'ENVIADO', 'APROVADO', 'APROVADO_PARCIAL', 'RECUSADO', 'EXPIRADO', 'CANCELADO'
);
CREATE TYPE "QuoteItemType" AS ENUM ('SERVICO', 'PECA', 'MAO_DE_OBRA');
CREATE TYPE "QuoteItemDecision" AS ENUM ('PENDENTE', 'APROVADO', 'RECUSADO');
CREATE TYPE "QuoteAdjustmentType" AS ENUM ('PERCENTUAL', 'FIXO');

CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'RASCUNHO',
    "customerId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "currentVersionNumber" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "quotes_number_key" ON "quotes"("number");
CREATE INDEX "quotes_customerId_idx" ON "quotes"("customerId");
CREATE INDEX "quotes_vehicleId_idx" ON "quotes"("vehicleId");
CREATE INDEX "quotes_status_idx" ON "quotes"("status");

ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "quote_versions" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'RASCUNHO',
    "validUntil" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "internalNotes" TEXT,
    "customerMessage" TEXT,
    "subtotalServicesCents" INTEGER NOT NULL DEFAULT 0,
    "subtotalPartsCents" INTEGER NOT NULL DEFAULT 0,
    "subtotalLaborCents" INTEGER NOT NULL DEFAULT 0,
    "discountType" "QuoteAdjustmentType",
    "discountValue" INTEGER,
    "discountTotalCents" INTEGER NOT NULL DEFAULT 0,
    "surchargeType" "QuoteAdjustmentType",
    "surchargeValue" INTEGER,
    "surchargeTotalCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quote_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "quote_versions_quoteId_versionNumber_key" ON "quote_versions"("quoteId", "versionNumber");
CREATE INDEX "quote_versions_quoteId_idx" ON "quote_versions"("quoteId");
CREATE INDEX "quote_versions_status_idx" ON "quote_versions"("status");

ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_quoteId_fkey"
    FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "quote_items" (
    "id" TEXT NOT NULL,
    "quoteVersionId" TEXT NOT NULL,
    "type" "QuoteItemType" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "clientDecision" "QuoteItemDecision" NOT NULL DEFAULT 'PENDENTE',
    "catalogItemType" TEXT,
    "catalogItemId" TEXT,
    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "quote_items_quoteVersionId_idx" ON "quote_items"("quoteVersionId");

ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quoteVersionId_fkey"
    FOREIGN KEY ("quoteVersionId") REFERENCES "quote_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
