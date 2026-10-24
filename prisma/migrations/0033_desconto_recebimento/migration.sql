-- Migração 0033 — Etapa 3.3
-- Aditiva: uma tabela nova; nada existente é alterado.
--
-- work_order_discounts: desconto dado no recebimento de uma OS entregue. Abate do
-- saldo a receber, mas NÃO é dinheiro recebido (não entra em work_order_payments,
-- então o faturamento do Início não muda). Só se acrescenta; nunca se edita.

CREATE TABLE "work_order_discounts" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_order_discounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "work_order_discounts_amount_check" CHECK ("amountCents" > 0)
);

CREATE INDEX "work_order_discounts_workOrderId_idx" ON "work_order_discounts"("workOrderId");

ALTER TABLE "work_order_discounts" ADD CONSTRAINT "work_order_discounts_workOrderId_fkey"
    FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_discounts" ADD CONSTRAINT "work_order_discounts_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
