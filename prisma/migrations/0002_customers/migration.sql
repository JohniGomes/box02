-- Migração 0002 — Ciclo 2: Clientes
-- Corresponde exatamente ao modelo Customer em prisma/schema.prisma.
-- Ver nota sobre migrações manuais em README.md / TECH_DEBT.md (DT1).

CREATE TYPE "CustomerType" AS ENUM ('PF', 'PJ');
CREATE TYPE "CustomerStatus" AS ENUM ('ATIVO', 'INATIVO');

CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "type" "CustomerType" NOT NULL,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ATIVO',
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "contactName" TEXT,
    "document" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "addressStreet" TEXT,
    "addressNumber" TEXT,
    "addressComplement" TEXT,
    "addressNeighborhood" TEXT,
    "addressCity" TEXT,
    "addressState" TEXT,
    "addressZipCode" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- Único quando o documento é informado; permite múltiplos clientes sem
-- documento (NULL não conflita com NULL em índice único no Postgres).
CREATE UNIQUE INDEX "customers_document_key" ON "customers"("document") WHERE "document" IS NOT NULL;

-- Índices de apoio à busca (nome, e-mail, telefone) — item "pesquisar
-- cliente rapidamente" da especificação do Ciclo 2.
CREATE INDEX "customers_legalName_idx" ON "customers" USING gin (to_tsvector('portuguese', "legalName"));
CREATE INDEX "customers_email_idx" ON "customers"("email");
CREATE INDEX "customers_phone_idx" ON "customers"("phone");
CREATE INDEX "customers_status_idx" ON "customers"("status");
