-- Migração 0020 — Agenda mínima (agendamentos)
-- Escopo propositalmente enxuto, decisão explícita: cliente + veículo
-- (opcional) + data/hora + observação. Sem baias, sem detecção de
-- conflito de horário, sem vínculo com serviço/catálogo — isso fica
-- para quando (e se) for pedido. Cancelamento é um campo de status, não
-- exclusão (mesmo padrão write-once/histórico usado no resto do
-- sistema).

CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AGENDADO',
    "createdByUserId" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "appointments_status_check" CHECK ("status" IN ('AGENDADO', 'CANCELADO'))
);

CREATE INDEX "appointments_scheduledAt_idx" ON "appointments"("scheduledAt");
CREATE INDEX "appointments_customerId_idx" ON "appointments"("customerId");

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
