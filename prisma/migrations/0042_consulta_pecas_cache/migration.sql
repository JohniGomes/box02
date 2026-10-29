-- Migração 0042 — Fase 4, consulta de peças com IA
-- Uma tabela nova. Guarda o resultado de cada consulta (veículo + peça) para não gastar a cota da
-- pesquisa na internet repetindo a mesma pergunta. Os resultados são só sugestões.

CREATE TABLE "part_consults" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "vehicleLabel" TEXT NOT NULL,
    "partLabel" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "part_consults_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "part_consults_cacheKey_key" ON "part_consults"("cacheKey");
ALTER TABLE "part_consults" ADD CONSTRAINT "part_consults_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
