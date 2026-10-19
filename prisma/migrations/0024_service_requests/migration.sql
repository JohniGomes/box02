-- Migração 0022 — Solicitação pública de serviço (cliente preenche sozinho)
-- Formulário público (sem login) em /solicitar: o cliente digita nome,
-- telefone, veículo e o que precisa. Isso cria um registro aqui — não
-- cria Customer/Vehicle/WorkOrder automaticamente (evita duplicar
-- cadastro quando o cliente já existe; Carlos/Matheus decidem isso na
-- tela interna /dashboard/solicitacoes, olhando pra cada solicitação).

CREATE TABLE "service_requests" (
    "id" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "vehicleDescription" TEXT,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "attendedByUserId" TEXT,
    "attendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "service_requests_status_check" CHECK ("status" IN ('PENDENTE', 'ATENDIDA', 'DESCARTADA'))
);

CREATE INDEX "service_requests_status_idx" ON "service_requests"("status");
CREATE INDEX "service_requests_createdAt_idx" ON "service_requests"("createdAt");

ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_attendedByUserId_fkey"
    FOREIGN KEY ("attendedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
