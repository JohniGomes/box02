-- Migração 0034 — Fase 2C, passo 1
-- Só amplia o que o agendamento aceita; nenhum agendamento existente muda.
--
-- * status: além de AGENDADO e CANCELADO, passa a aceitar COMPARECEU e NAO_COMPARECEU.
-- * workOrderId: OS criada a partir do agendamento (opcional; usada no passo 1B).

ALTER TABLE "appointments" DROP CONSTRAINT "appointments_status_check";
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_status_check"
    CHECK ("status" IN ('AGENDADO', 'CANCELADO', 'COMPARECEU', 'NAO_COMPARECEU'));

ALTER TABLE "appointments" ADD COLUMN "workOrderId" TEXT;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_workOrderId_fkey"
    FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
