-- Migração 0008 — Execução Operacional / Ciclo A: Biblioteca de Serviços
-- Escopo restrito ao cadastro em si — nenhuma tabela existente é alterada.
-- Ver TECH_DEBT.md (DT1) sobre migrações manuais.

CREATE TYPE "ServiceStatus" AS ENUM ('ATIVO', 'INATIVO');

CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "defaultPriceCents" INTEGER,
    "status" "ServiceStatus" NOT NULL DEFAULT 'ATIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "services_status_idx" ON "services"("status");
CREATE INDEX "services_name_idx" ON "services"("name");
