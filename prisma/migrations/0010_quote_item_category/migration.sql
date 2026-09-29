-- Migração 0010 — Ciclo C1: Orçamento em três camadas
-- Escopo: só quote_items ganha a coluna "category". Nenhuma outra tabela
-- é tocada (work_order_items e o resto do Ciclo B ficam intactos).

CREATE TYPE "QuoteItemCategory" AS ENUM ('NECESSARIO', 'RECOMENDADO', 'INFORMATIVO');

-- DEFAULT só para permitir o ALTER TABLE rodar (não há dado de produção
-- ainda neste projeto) — a coluna nasce NOT NULL de verdade, e a validação
-- da aplicação (quoteItemInputSchema) sempre exige o campo explicitamente,
-- nunca deixa a aplicação depender desse default silenciosamente.
ALTER TABLE "quote_items" ADD COLUMN "category" "QuoteItemCategory" NOT NULL DEFAULT 'NECESSARIO';
ALTER TABLE "quote_items" ALTER COLUMN "category" DROP DEFAULT;
