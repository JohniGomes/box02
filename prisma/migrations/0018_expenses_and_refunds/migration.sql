-- Migração 0018 — Ciclo M: Financeiro completo (Fatia 1)
-- Despesas/Contas a pagar (independentes da OS) + estorno de recebimento
-- (DEC-I6 revisitada: o recebimento original continua write-once, nunca
-- editado nem apagado — o estorno é um registro novo, separado, que só
-- desconta na soma calculada na leitura).

CREATE TYPE "ExpenseCategory" AS ENUM (
  'ALUGUEL',
  'SALARIOS',
  'FORNECEDORES',
  'IMPOSTOS',
  'MANUTENCAO_EQUIPAMENTOS',
  'UTILIDADES',
  'MARKETING',
  'OUTROS'
);

CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "supplierName" TEXT,
    "amountCents" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paymentMethod" "WorkOrderPaymentMethod",
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "expenses_dueDate_idx" ON "expenses"("dueDate");
CREATE INDEX "expenses_paidAt_idx" ON "expenses"("paidAt");

ALTER TABLE "expenses" ADD CONSTRAINT "expenses_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "work_order_payment_refunds" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "refundCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "refundedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_payment_refunds_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "work_order_payment_refunds_paymentId_idx" ON "work_order_payment_refunds"("paymentId");
CREATE INDEX "work_order_payment_refunds_workOrderId_idx" ON "work_order_payment_refunds"("workOrderId");

ALTER TABLE "work_order_payment_refunds" ADD CONSTRAINT "work_order_payment_refunds_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "work_order_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_payment_refunds" ADD CONSTRAINT "work_order_payment_refunds_workOrderId_fkey"
    FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_payment_refunds" ADD CONSTRAINT "work_order_payment_refunds_refundedByUserId_fkey"
    FOREIGN KEY ("refundedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
