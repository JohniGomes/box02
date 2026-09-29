-- Migração 0017 — Ciclo J: Evidências/Fotos
-- Vinculada só à OS (DEC-J4). Mutabilidade reaproveita
-- "receptionAcceptedAt" já existente em work_orders — nenhuma coluna
-- nova para a trava. Acesso só interno (DEC-J6) — sem campo de URL
-- pública, só a chave do objeto no bucket privado (storageKey).

CREATE TYPE "WorkOrderEvidenceType" AS ENUM ('GERAL', 'AVARIA');

CREATE TABLE "work_order_evidences" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "type" "WorkOrderEvidenceType" NOT NULL,
    "description" TEXT,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_evidences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "work_order_evidences_storageKey_key" ON "work_order_evidences"("storageKey");
CREATE INDEX "work_order_evidences_workOrderId_idx" ON "work_order_evidences"("workOrderId");

ALTER TABLE "work_order_evidences" ADD CONSTRAINT "work_order_evidences_workOrderId_fkey"
    FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_order_evidences" ADD CONSTRAINT "work_order_evidences_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
