-- Migração 0022 — markup por peça (preço de venda sugerido)
-- Percentual de lucro desejado específico da peça. Opcional: quando
-- não preenchido, o preço sugerido cai para o markup padrão da
-- oficina (mesma configuração já usada em Serviços, Configurações →
-- Precificação). Preço de venda NUNCA é armazenado — sempre derivado
-- na leitura (custo × (1 + markup/100)), mesmo padrão do Ciclo H.

ALTER TABLE "parts" ADD COLUMN "markupPercent" DOUBLE PRECISION;
