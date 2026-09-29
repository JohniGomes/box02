-- Migração 0007 — Ciclo 5 / Sub-etapa 2: Adicionais durante a execução
-- Corresponde exatamente ao schema.prisma (colunas novas em WorkOrderItem
-- + enums). Ver TECH_DEBT.md (DT1) sobre migrações manuais.

ALTER TYPE "WorkOrderAuthorizationChannel" ADD VALUE 'LINK';

CREATE TYPE "WorkOrderItemClientDecision" AS ENUM ('PENDENTE', 'APROVADO', 'RECUSADO');

ALTER TABLE "work_order_items"
  ADD COLUMN "clientDecision" "WorkOrderItemClientDecision" NOT NULL DEFAULT 'PENDENTE',
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "accessToken" TEXT,
  ADD COLUMN "accessTokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN "accessTokenRevokedAt" TIMESTAMP(3),
  ADD COLUMN "supersedesItemId" TEXT,
  ADD COLUMN "authorizationIpAddress" TEXT;

CREATE UNIQUE INDEX "work_order_items_accessToken_key" ON "work_order_items"("accessToken");
CREATE UNIQUE INDEX "work_order_items_supersedesItemId_key" ON "work_order_items"("supersedesItemId");

ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_supersedesItemId_fkey"
    FOREIGN KEY ("supersedesItemId") REFERENCES "work_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
