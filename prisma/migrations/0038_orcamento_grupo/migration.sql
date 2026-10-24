-- Migração 0038 — Fase 2E
-- Uma coluna opcional em quote_items; nenhum orçamento existente muda.
--
-- groupKey: itens com o mesmo groupKey formam um "bloco" (um serviço com suas peças e
-- mão de obra). No link de aprovação o cliente decide o bloco inteiro de uma vez.
-- Item sem groupKey continua sendo um bloco sozinho, como sempre foi.

ALTER TABLE "quote_items" ADD COLUMN "groupKey" TEXT;
CREATE INDEX "quote_items_quoteVersionId_groupKey_idx" ON "quote_items"("quoteVersionId", "groupKey");
