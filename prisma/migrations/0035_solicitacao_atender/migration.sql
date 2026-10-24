-- Migração 0035 — Fase 2C, passo 2
-- Só colunas novas e opcionais em service_requests; nada existente muda.
--
-- * vehiclePlate / preferredTime: placa e "melhor dia/horário" informados no formulário público.
-- * customerId / vehicleId / appointmentId: o que foi usado ou criado ao "Atender" a solicitação.

ALTER TABLE "service_requests" ADD COLUMN "vehiclePlate" TEXT;
ALTER TABLE "service_requests" ADD COLUMN "preferredTime" TEXT;
ALTER TABLE "service_requests" ADD COLUMN "customerId" TEXT;
ALTER TABLE "service_requests" ADD COLUMN "vehicleId" TEXT;
ALTER TABLE "service_requests" ADD COLUMN "appointmentId" TEXT;

ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_appointmentId_fkey"
    FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
