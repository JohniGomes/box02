-- Migração 0015 — Ciclo H: Precificação e Custos
-- Só uma coluna nullable em services. Nenhum dado de negócio semeado —
-- nem custo, nem markup padrão (H4-D4, decisão explícita: o sistema
-- nasce sem markup configurado, sem valor inventado).

ALTER TABLE "services" ADD COLUMN "costCents" INTEGER;
