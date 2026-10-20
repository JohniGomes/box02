-- Migração 0029 — vínculo de "retorno" entre OS
-- Quando o carro volta depois de entregue (garantia ou problema novo), abre-se
-- uma OS nova ligada à original. A original continua entregue e paga.
-- Aditiva: só uma coluna opcional; nada existente é alterado.

ALTER TABLE "work_orders" ADD COLUMN "returnOfWorkOrderId" TEXT;

ALTER TABLE "work_orders"
    ADD CONSTRAINT "work_orders_returnOfWorkOrderId_fkey"
    FOREIGN KEY ("returnOfWorkOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "work_orders_returnOfWorkOrderId_idx" ON "work_orders"("returnOfWorkOrderId");
