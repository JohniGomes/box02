-- Migração 0045 — QR Car (página pública do veículo)
-- Só acrescenta: nenhum veículo muda e nenhum ganha QR sozinho.
--
-- vehicles.publicToken: código aleatório (difícil de adivinhar) do link público do veículo.
--   Nulo = sem QR. "Gerar novo QR" troca o código e o antigo deixa de funcionar.

ALTER TABLE "vehicles" ADD COLUMN "publicToken" TEXT;
CREATE UNIQUE INDEX "vehicles_publicToken_key" ON "vehicles"("publicToken") WHERE "publicToken" IS NOT NULL;
