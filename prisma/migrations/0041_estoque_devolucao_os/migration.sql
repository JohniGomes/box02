-- Migração 0041 — Fase 3: devolver peças ao estoque ao cancelar a OS
-- Duas colunas opcionais em stock_movements; nenhum movimento existente muda.
--
-- workOrderItemId: item da OS a que a baixa/devolução se refere (para nunca devolver duas vezes).
-- source: de onde veio o movimento da OS:
--   OS_BAIXA      baixa automática ao executar o item
--   OS_DEVOLUCAO  devolução ao estoque quando a OS foi cancelada
--   OS_REBAIXA    nova baixa quando a OS cancelada foi reativada

ALTER TABLE "stock_movements" ADD COLUMN "workOrderItemId" TEXT;
ALTER TABLE "stock_movements" ADD COLUMN "source" TEXT;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_source_check"
    CHECK ("source" IS NULL OR "source" IN ('OS_BAIXA', 'OS_DEVOLUCAO', 'OS_REBAIXA'));
CREATE INDEX "stock_movements_workOrderItemId_idx" ON "stock_movements"("workOrderItemId");
