-- Migração 0046 — taxa da maquininha repassada ao cliente, registrada no recebimento
-- Só acrescenta: recebimentos antigos ficam sem taxa (nulo) e nada muda neles.
--
-- work_order_payments.amountCents continua sendo o valor DO SERVIÇO recebido (o que abate o saldo da OS
--   e o que entra no Financeiro). Quando o cliente paga a taxa da maquininha junto, ela fica à parte:
-- cardFeeCents: taxa repassada ao cliente, em centavos (só em recebimento no cartão). O cliente passou no
--   cartão amountCents + cardFeeCents. Nulo = sem taxa registrada (aí vale a estimativa das Regras).
-- installments: em quantas vezes o cliente pagou no cartão (só informação).

ALTER TABLE "work_order_payments" ADD COLUMN "cardFeeCents" INTEGER;
ALTER TABLE "work_order_payments" ADD COLUMN "installments" INTEGER;

ALTER TABLE "work_order_payments" ADD CONSTRAINT "work_order_payments_cardFee_check"
    CHECK ("cardFeeCents" IS NULL OR ("cardFeeCents" >= 0 AND "method" = 'CARTAO'));
ALTER TABLE "work_order_payments" ADD CONSTRAINT "work_order_payments_installments_check"
    CHECK ("installments" IS NULL OR ("installments" >= 1 AND "installments" <= 24 AND "method" = 'CARTAO'));
