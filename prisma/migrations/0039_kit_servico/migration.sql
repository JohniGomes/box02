-- Migração 0039 — Fase 2D, kits de serviço
-- Uma tabela nova; nada existente muda.
--
-- service_kit_items: a lista usual de peças e mão de obra de um serviço. O kit só
-- acrescenta linhas editáveis num orçamento; não grava preço no orçamento sozinho
-- e não mexe no estoque (a baixa continua acontecendo só na execução).
--  * peça genérica (óleo, filtro, fluido): guarda a peça (partId); preço vem do estoque na hora.
--  * peça que depende do veículo (pastilha, correia): partId vazio = "vaga a escolher do estoque".
--  * mão de obra: guarda o valor usual (unitPriceCents).

CREATE TABLE "service_kit_items" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "partId" TEXT,
    "unitPriceCents" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "service_kit_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "service_kit_items_type_check" CHECK ("type" IN ('PECA', 'MAO_DE_OBRA')),
    CONSTRAINT "service_kit_items_quantity_check" CHECK ("quantity" > 0)
);

CREATE INDEX "service_kit_items_serviceId_idx" ON "service_kit_items"("serviceId");

ALTER TABLE "service_kit_items" ADD CONSTRAINT "service_kit_items_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_kit_items" ADD CONSTRAINT "service_kit_items_partId_fkey"
    FOREIGN KEY ("partId") REFERENCES "parts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
