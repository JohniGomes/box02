-- Migração 0012 — Execução Operacional / Ciclo E: checklists na OS
-- Congelamento por cópia — nenhuma coluna nova em work_orders/work_order_items,
-- só as duas tabelas de instância congelada.

CREATE TYPE "WorkOrderChecklistType" AS ENUM ('ENTRADA', 'EXECUCAO', 'ENTREGA');

CREATE TABLE "work_order_checklists" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "workOrderItemId" TEXT,
    "sourceChecklistId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WorkOrderChecklistType" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    CONSTRAINT "work_order_checklists_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "work_order_checklists_workOrderId_idx" ON "work_order_checklists"("workOrderId");
CREATE INDEX "work_order_checklists_workOrderItemId_idx" ON "work_order_checklists"("workOrderItemId");

ALTER TABLE "work_order_checklists" ADD CONSTRAINT "work_order_checklists_workOrderId_fkey"
    FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_order_checklists" ADD CONSTRAINT "work_order_checklists_workOrderItemId_fkey"
    FOREIGN KEY ("workOrderItemId") REFERENCES "work_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_order_checklists" ADD CONSTRAINT "work_order_checklists_sourceChecklistId_fkey"
    FOREIGN KEY ("sourceChecklistId") REFERENCES "checklists"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_order_checklists" ADD CONSTRAINT "work_order_checklists_completedByUserId_fkey"
    FOREIGN KEY ("completedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "work_order_checklist_items" (
    "id" TEXT NOT NULL,
    "workOrderChecklistId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" TIMESTAMP(3),
    "checkedByUserId" TEXT,
    CONSTRAINT "work_order_checklist_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "work_order_checklist_items_workOrderChecklistId_idx" ON "work_order_checklist_items"("workOrderChecklistId");

ALTER TABLE "work_order_checklist_items" ADD CONSTRAINT "work_order_checklist_items_workOrderChecklistId_fkey"
    FOREIGN KEY ("workOrderChecklistId") REFERENCES "work_order_checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_order_checklist_items" ADD CONSTRAINT "work_order_checklist_items_checkedByUserId_fkey"
    FOREIGN KEY ("checkedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
