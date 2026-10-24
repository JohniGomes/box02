-- Migração 0036 — Fase 2C, passo 3 (central de mensagens)
-- Uma tabela nova; nada existente muda.
--
-- message_log: registra que uma mensagem pronta foi enviada (ou pulada) pela oficina,
-- para a central de mensagens não oferecer a mesma mensagem duas vezes.
-- O sistema nunca envia nada sozinho: quem toca em "enviar" no WhatsApp é uma pessoa.

CREATE TABLE "message_log" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'ENVIADA',
    "sentByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "message_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "message_log_kind_check" CHECK ("kind" IN ('CONFIRMACAO', 'LEMBRETE', 'AVALIACAO', 'COBRANCA')),
    CONSTRAINT "message_log_action_check" CHECK ("action" IN ('ENVIADA', 'PULADA'))
);

CREATE INDEX "message_log_kind_refId_idx" ON "message_log"("kind", "refId");

ALTER TABLE "message_log" ADD CONSTRAINT "message_log_sentByUserId_fkey"
    FOREIGN KEY ("sentByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
