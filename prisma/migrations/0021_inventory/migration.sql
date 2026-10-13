-- Migração 0021 — Estoque de peças e insumos
-- Escopo: catálogo de peças (parts) + ledger de movimentações
-- (stock_movements). Saldo NUNCA é armazenado — sempre derivado por
-- soma das movimentações (mesmo padrão já usado em work_order_payments
-- /sumWorkOrderPayments). Decisão explícita: SEM vínculo automático com
-- OS/orçamento (o momento da baixa de estoque por OS nunca foi
-- decidido pelos sócios — ver DECISIONS.md D1) — este ciclo é só
-- lançamento manual e acompanhamento, não baixa automática.

CREATE TABLE "parts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'un',
    "costCents" INTEGER,
    "minStock" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "parts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "parts_status_check" CHECK ("status" IN ('ATIVO', 'INATIVO'))
);

CREATE UNIQUE INDEX "parts_sku_key" ON "parts"("sku") WHERE "sku" IS NOT NULL;
CREATE INDEX "parts_name_idx" ON "parts"("name");

CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stock_movements_type_check" CHECK ("type" IN ('ENTRADA', 'SAIDA')),
    CONSTRAINT "stock_movements_quantity_check" CHECK ("quantity" > 0)
);

CREATE INDEX "stock_movements_partId_idx" ON "stock_movements"("partId");
CREATE INDEX "stock_movements_createdAt_idx" ON "stock_movements"("createdAt");

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_partId_fkey"
    FOREIGN KEY ("partId") REFERENCES "parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
