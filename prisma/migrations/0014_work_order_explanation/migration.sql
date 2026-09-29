-- Migração 0014 — UI do Método BOX 02: registro de EXPLICAMOS
-- independente de orçamento. Só uma coluna nullable em work_orders.

ALTER TABLE "work_orders" ADD COLUMN "diagnosisExplanationNotes" TEXT;
