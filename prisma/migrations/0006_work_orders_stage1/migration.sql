-- Migração 0006 — Ciclo 5 / Sub-etapa 1: Ordem de Serviço (OS básica)
-- Corresponde exatamente ao schema.prisma (WorkOrder, WorkOrderItem, WorkOrderClosure).
-- Ver nota sobre migrações manuais em TECH_DEBT.md (DT1).

CREATE TYPE "WorkOrderStatus" AS ENUM (
  'ABERTA', 'EM_DIAGNOSTICO', 'EM_EXECUCAO', 'AGUARDANDO_PECA',
  'TESTE_FINAL', 'PRONTA', 'ENTREGUE', 'CANCELADA'
);

CREATE TYPE "WorkOrderItemOrigin" AS ENUM (
  'DO_ORCAMENTO', 'ADICIONAL_DURANTE_EXECUCAO', 'SEM_ORCAMENTO'
);

CREATE TYPE "WorkOrderItemStatus" AS ENUM ('PLANEJADO', 'EXECUTADO', 'CANCELADO');

CREATE TYPE "WorkOrderAuthorizationChannel" AS ENUM ('TELEFONE', 'PRESENCIAL', 'WHATSAPP');

CREATE TABLE "work_orders" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'ABERTA',
    "customerId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "sourceQuoteVersionId" TEXT,
    "entryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "mileageAtEntry" INTEGER NOT NULL,
    "customerComplaint" TEXT,
    "diagnosis" TEXT,
    "technicalNotes" TEXT,
    "discountType" "QuoteAdjustmentType",
    "discountValue" INTEGER,
    "discountTotalCents" INTEGER NOT NULL DEFAULT 0,
    "surchargeType" "QuoteAdjustmentType",
    "surchargeValue" INTEGER,
    "surchargeTotalCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "customerNameSnapshot" TEXT NOT NULL,
    "vehiclePlateSnapshot" TEXT,
    "vehicleDescriptionSnapshot" TEXT,
    "cancelReason" TEXT,
    "deliveryAcceptedName" TEXT,
    "deliveryAcceptedDocument" TEXT,
    "deliveredByUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "work_orders_number_key" ON "work_orders"("number");
CREATE INDEX "work_orders_customerId_idx" ON "work_orders"("customerId");
CREATE INDEX "work_orders_vehicleId_idx" ON "work_orders"("vehicleId");
CREATE INDEX "work_orders_status_idx" ON "work_orders"("status");

ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_sourceQuoteVersionId_fkey"
    FOREIGN KEY ("sourceQuoteVersionId") REFERENCES "quote_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_deliveredByUserId_fkey"
    FOREIGN KEY ("deliveredByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "work_order_items" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "type" "QuoteItemType" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "origin" "WorkOrderItemOrigin" NOT NULL,
    "sourceQuoteItemId" TEXT,
    "status" "WorkOrderItemStatus" NOT NULL DEFAULT 'PLANEJADO',
    "executedAt" TIMESTAMP(3),
    "executedByUserId" TEXT,
    "clientAuthorizedBy" TEXT,
    "clientAuthorizedAt" TIMESTAMP(3),
    "authorizationChannel" "WorkOrderAuthorizationChannel",
    "authorizationNotes" TEXT,
    "catalogItemType" TEXT,
    "catalogItemId" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "work_order_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "work_order_items_workOrderId_idx" ON "work_order_items"("workOrderId");

ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_workOrderId_fkey"
    FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_sourceQuoteItemId_fkey"
    FOREIGN KEY ("sourceQuoteItemId") REFERENCES "quote_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_executedByUserId_fkey"
    FOREIGN KEY ("executedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "work_order_closures" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedByUserId" TEXT NOT NULL,
    "totalAtClosureCents" INTEGER NOT NULL,
    "reopenedAt" TIMESTAMP(3),
    "reopenedByUserId" TEXT,
    "reopenReason" TEXT,
    CONSTRAINT "work_order_closures_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "work_order_closures_workOrderId_idx" ON "work_order_closures"("workOrderId");

ALTER TABLE "work_order_closures" ADD CONSTRAINT "work_order_closures_workOrderId_fkey"
    FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_order_closures" ADD CONSTRAINT "work_order_closures_closedByUserId_fkey"
    FOREIGN KEY ("closedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_closures" ADD CONSTRAINT "work_order_closures_reopenedByUserId_fkey"
    FOREIGN KEY ("reopenedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
