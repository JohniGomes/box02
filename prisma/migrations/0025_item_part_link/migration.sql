-- Migração 0025 — vincula item de orçamento/OS a uma peça do estoque
-- Mesmo padrão do serviceId (migração 0009): nullable, SET NULL se a peça
-- for apagada, congelado no momento da criação (nunca revalidado depois).
-- Habilita: (1) preço sugerido (custo+markup) pré-preenchido ao montar
-- orçamento/OS a partir do catálogo de peças; (2) baixa automática de
-- estoque quando o item de peça é marcado EXECUTADO na OS.

ALTER TABLE "quote_items" ADD COLUMN "partId" TEXT;
CREATE INDEX "quote_items_partId_idx" ON "quote_items"("partId");
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_partId_fkey"
    FOREIGN KEY ("partId") REFERENCES "parts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "work_order_items" ADD COLUMN "partId" TEXT;
CREATE INDEX "work_order_items_partId_idx" ON "work_order_items"("partId");
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_partId_fkey"
    FOREIGN KEY ("partId") REFERENCES "parts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
