-- Migração 0003 — Ciclo 3: Veículos
-- Corresponde exatamente ao modelo Vehicle em prisma/schema.prisma.
-- Ver nota sobre migrações manuais em README.md / TECH_DEBT.md (DT1).

CREATE TYPE "VehicleStatus" AS ENUM ('ATIVO', 'INATIVO');

CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "status" "VehicleStatus" NOT NULL DEFAULT 'ATIVO',
    "customerId" TEXT NOT NULL,
    "plate" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "version" TEXT,
    "yearManufacture" INTEGER,
    "yearModel" INTEGER,
    "color" TEXT,
    "fuelType" TEXT,
    "mileage" INTEGER,
    "chassis" TEXT,
    "renavam" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Único quando a placa é informada (mesmo padrão do documento do cliente).
CREATE UNIQUE INDEX "vehicles_plate_key" ON "vehicles"("plate") WHERE "plate" IS NOT NULL;

CREATE INDEX "vehicles_customerId_idx" ON "vehicles"("customerId");
CREATE INDEX "vehicles_status_idx" ON "vehicles"("status");
CREATE INDEX "vehicles_brand_model_idx" ON "vehicles"("brand", "model");
