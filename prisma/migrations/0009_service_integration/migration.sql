-- Migração 0009 — Execução Operacional / Ciclo B: integração serviceId
-- Escopo: só quote_items e work_order_items ganham serviceId nullable.
-- catalogItemType/catalogItemId permanecem intocados (reservados).

ALTER TABLE "quote_items" ADD COLUMN "serviceId" TEXT;
CREATE INDEX "quote_items_serviceId_idx" ON "quote_items"("serviceId");
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "work_order_items" ADD COLUMN "serviceId" TEXT;
CREATE INDEX "work_order_items_serviceId_idx" ON "work_order_items"("serviceId");
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
