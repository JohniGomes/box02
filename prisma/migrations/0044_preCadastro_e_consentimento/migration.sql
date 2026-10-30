-- Migração 0044 — pré-cadastro e consentimento de lembretes
-- Só acrescenta: nada do que existe muda e os clientes atuais ficam "sem resposta".
--
-- customers.isPreRegistration: cadastro feito às pressas (cadastro rápido, "Atender", assistente);
--   aparece com etiqueta "conferir na recepção" até alguém salvar o cadastro completo ou tocar em "Já conferi".
-- customers.remindersConsent: o cliente aceita (SIM) ou não quer (NAO) lembretes e avisos por WhatsApp;
--   NULL = ainda não perguntado. remindersConsentAt guarda quando foi registrado.
-- message_log: passa a aceitar o tipo PERMISSAO (pedido de permissão para lembretes).

ALTER TABLE "customers" ADD COLUMN "isPreRegistration" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "customers" ADD COLUMN "remindersConsent" TEXT;
ALTER TABLE "customers" ADD COLUMN "remindersConsentAt" TIMESTAMP(3);
ALTER TABLE "customers" ADD CONSTRAINT "customers_remindersConsent_check"
    CHECK ("remindersConsent" IS NULL OR "remindersConsent" IN ('SIM', 'NAO'));

ALTER TABLE "message_log" DROP CONSTRAINT "message_log_kind_check";
ALTER TABLE "message_log" ADD CONSTRAINT "message_log_kind_check"
    CHECK ("kind" IN ('CONFIRMACAO', 'LEMBRETE', 'AVALIACAO', 'COBRANCA', 'TROCA', 'PERMISSAO'));
