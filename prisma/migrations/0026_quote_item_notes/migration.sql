-- Migração 0026 — observações por item de orçamento
-- Texto livre, nullable. Usado principalmente em itens de Mão de obra, para
-- discriminar o que foi feito. Congelado junto com o resto do item (a versão
-- do orçamento é imutável depois de enviada; mudar exige nova versão).

ALTER TABLE "quote_items" ADD COLUMN "notes" TEXT;
