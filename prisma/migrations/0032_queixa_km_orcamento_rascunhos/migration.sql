-- Migração 0032 — Fase 2B
-- Aditiva: só colunas opcionais e uma tabela nova; nada existente é alterado.
--
-- * quotes.customerComplaint / quotes.mileageAtEntry: queixa do cliente e KM do
--   painel guardados na parte fixa do orçamento (valem para todas as versões) e
--   copiados para a OS quando ela é criada.
-- * drafts: rascunhos genéricos ("Salvar e continuar depois") de formulários
--   longos. Guardam só o que foi digitado (JSON); nunca mexem em estoque nem em
--   dinheiro, e podem ser descartados.

ALTER TABLE "quotes" ADD COLUMN "customerComplaint" TEXT;
ALTER TABLE "quotes" ADD COLUMN "mileageAtEntry" INTEGER;

CREATE TABLE "drafts" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "drafts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "drafts_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "drafts_updatedAt_idx" ON "drafts"("updatedAt");
CREATE INDEX "drafts_kind_idx" ON "drafts"("kind");
