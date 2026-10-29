-- Migração 0043 — Fase 2F: intervalos de troca
-- Duas colunas opcionais em services e um tipo novo de mensagem; nada existente muda.
--
-- services.intervalMonths / intervalKm: de quanto em quanto tempo ou KM o serviço se repete
-- (ex.: troca de óleo a cada 6 meses ou 10.000 km). Vazio = o serviço não tem lembrete.
-- message_log: passa a aceitar o tipo TROCA (lembrete de próxima troca).

ALTER TABLE "services" ADD COLUMN "intervalMonths" INTEGER;
ALTER TABLE "services" ADD COLUMN "intervalKm" INTEGER;
ALTER TABLE "services" ADD CONSTRAINT "services_intervalMonths_check" CHECK ("intervalMonths" IS NULL OR "intervalMonths" > 0);
ALTER TABLE "services" ADD CONSTRAINT "services_intervalKm_check" CHECK ("intervalKm" IS NULL OR "intervalKm" > 0);

ALTER TABLE "message_log" DROP CONSTRAINT "message_log_kind_check";
ALTER TABLE "message_log" ADD CONSTRAINT "message_log_kind_check"
    CHECK ("kind" IN ('CONFIRMACAO', 'LEMBRETE', 'AVALIACAO', 'COBRANCA', 'TROCA'));
