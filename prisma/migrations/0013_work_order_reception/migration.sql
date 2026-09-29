-- Migração 0013 — Ciclo F: Termo de Recepção
-- Só colunas nullable em work_orders. Nenhuma tabela nova, nenhuma
-- mudança em tabela existente além desta.

ALTER TABLE "work_orders" ADD COLUMN "preExistingDamagesDescription" TEXT;

ALTER TABLE "work_orders" ADD COLUMN "receptionAcceptedName" TEXT;
ALTER TABLE "work_orders" ADD COLUMN "receptionAcceptedDocument" TEXT;
ALTER TABLE "work_orders" ADD COLUMN "receptionAcceptedAt" TIMESTAMP(3);
ALTER TABLE "work_orders" ADD COLUMN "receivedByUserId" TEXT;
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_receivedByUserId_fkey"
    FOREIGN KEY ("receivedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "work_orders" ADD COLUMN "receptionComplaintSnapshot" TEXT;
ALTER TABLE "work_orders" ADD COLUMN "receptionDamagesSnapshot" TEXT;
ALTER TABLE "work_orders" ADD COLUMN "receptionChecklistSnapshot" JSONB;
