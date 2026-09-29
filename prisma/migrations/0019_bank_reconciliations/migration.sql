-- Migração 0019 — Ciclo N: Conciliação bancária (manual)
-- Não mexe nos recebimentos nem nas despesas originais — segue o mesmo
-- padrão do estorno (Ciclo M): registro novo e separado que só marca
-- "confirmado no extrato", sem tocar no lançamento original.

CREATE TABLE "bank_reconciliations" (
    "id" TEXT NOT NULL,
    "entryType" TEXT NOT NULL,
    "paymentId" TEXT,
    "expenseId" TEXT,
    "reconciledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reconciledByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bank_reconciliations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bank_reconciliations_entryType_check" CHECK ("entryType" IN ('RECEBIMENTO', 'DESPESA')),
    CONSTRAINT "bank_reconciliations_entry_check" CHECK (
        ("entryType" = 'RECEBIMENTO' AND "paymentId" IS NOT NULL AND "expenseId" IS NULL)
        OR ("entryType" = 'DESPESA' AND "expenseId" IS NOT NULL AND "paymentId" IS NULL)
    )
);

CREATE UNIQUE INDEX "bank_reconciliations_paymentId_key" ON "bank_reconciliations"("paymentId");
CREATE UNIQUE INDEX "bank_reconciliations_expenseId_key" ON "bank_reconciliations"("expenseId");

ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "work_order_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_expenseId_fkey"
    FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_reconciledByUserId_fkey"
    FOREIGN KEY ("reconciledByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
