-- Migração 0030 — Compras de peças/insumos (fornecedores, compra com vários itens, insumo)
-- Aditiva: só cria tabelas/colunas opcionais; nada existente é alterado.
--
-- * suppliers: lista simples de fornecedores (ex.: a autopeças).
-- * purchases: uma compra (fornecedor, data, total, ajuste de frete/desconto).
-- * stock_movements.purchaseId e expenses.purchaseId: ligam as entradas de
--   estoque e as despesas (ou parcelas) à compra que as originou.
-- * parts.isConsumable: insumo (uso interno) — fica no estoque, mas não é
--   oferecido nos orçamentos.

CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "suppliers_status_check" CHECK ("status" IN ('ATIVO', 'INATIVO'))
);

CREATE UNIQUE INDEX "suppliers_name_lower_key" ON "suppliers" (lower("name"));

CREATE TABLE "purchases" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT,
    "supplierName" TEXT,
    "purchaseDate" DATE NOT NULL,
    "itemsTotalCents" INTEGER NOT NULL,
    "adjustmentCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchases_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "purchases_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "purchases_purchaseDate_idx" ON "purchases"("purchaseDate");

ALTER TABLE "stock_movements" ADD COLUMN "purchaseId" TEXT;
ALTER TABLE "stock_movements"
    ADD CONSTRAINT "stock_movements_purchaseId_fkey"
    FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "stock_movements_purchaseId_idx" ON "stock_movements"("purchaseId");

ALTER TABLE "expenses" ADD COLUMN "purchaseId" TEXT;
ALTER TABLE "expenses"
    ADD CONSTRAINT "expenses_purchaseId_fkey"
    FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "expenses_purchaseId_idx" ON "expenses"("purchaseId");

ALTER TABLE "parts" ADD COLUMN "isConsumable" BOOLEAN NOT NULL DEFAULT false;
