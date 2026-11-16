-- Migração 0047 — "Nome para o cliente" na peça
-- Só acrescenta uma coluna opcional: peças antigas ficam sem nome (nulo) e nada muda nelas.
--
-- parts.customerName: nome curto e genérico que aparece no orçamento (ex.: "Velas de ignição",
--   "Filtro de ar"). O nome técnico completo (código, aplicação) continua em parts.name e é o que
--   a equipe vê no estoque, nas compras e na OS. Nulo = o orçamento usa o próprio nome da peça.

ALTER TABLE "parts" ADD COLUMN "customerName" TEXT;
