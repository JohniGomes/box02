-- Migração 0031 — Fase 2A
-- Aditiva: só colunas opcionais (ou com padrão); nada existente é alterado.
--
-- * work_order_items.unitCostCents: custo unitário no momento em que o item foi
--   executado (peça: custo da peça; serviço do catálogo: custo estimado). Base do
--   lucro por serviço. Só passa a ser preenchido daqui para frente.
-- * quote_versions.discountReason / work_orders.discountReason: motivo (interno)
--   do desconto dado.
-- * quote_items.customerSupplied / work_order_items.customerSupplied: peça
--   fornecida pelo cliente (sem cobrança e sem baixa de estoque).
-- * expenses.workOrderId: despesa relacionada a uma OS (ex.: terceirizado).

ALTER TABLE "work_order_items" ADD COLUMN "unitCostCents" INTEGER;
ALTER TABLE "work_order_items" ADD COLUMN "customerSupplied" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "quote_items" ADD COLUMN "customerSupplied" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "quote_versions" ADD COLUMN "discountReason" TEXT;
ALTER TABLE "work_orders" ADD COLUMN "discountReason" TEXT;

ALTER TABLE "expenses" ADD COLUMN "workOrderId" TEXT;
ALTER TABLE "expenses"
    ADD CONSTRAINT "expenses_workOrderId_fkey"
    FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "expenses_workOrderId_idx" ON "expenses"("workOrderId");
