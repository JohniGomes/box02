-- Migração 0016 — Ciclo I: Recebimentos (Financeiro mínimo)
-- Só receitas, vinculadas à OS. Nenhuma tabela de contas a pagar, caixa
-- ou despesas. Nenhum dado de negócio semeado.

CREATE TYPE "WorkOrderPaymentMethod" AS ENUM ('DINHEIRO', 'PIX', 'CARTAO', 'OUTRO');

CREATE TABLE "work_order_payments" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" "WorkOrderPaymentMethod" NOT NULL,
    "notes" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registeredByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_order_payments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "work_order_payments_workOrderId_idx" ON "work_order_payments"("workOrderId");

ALTER TABLE "work_order_payments" ADD CONSTRAINT "work_order_payments_workOrderId_fkey"
    FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_payments" ADD CONSTRAINT "work_order_payments_registeredByUserId_fkey"
    FOREIGN KEY ("registeredByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
