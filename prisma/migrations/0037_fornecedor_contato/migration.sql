-- Migração 0037 — Fase 2D, fornecedor
-- Só duas colunas opcionais em suppliers; nada existente muda.

ALTER TABLE "suppliers" ADD COLUMN "phone" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "notes" TEXT;
