-- Migração 0028 — lista simples de executores (quem executou o serviço)
-- Sem login: são só nomes para marcar quem executou cada item da OS. O nome
-- escolhido fica copiado no item (executedByName), então continua certo mesmo
-- que o executor seja renomeado ou inativado depois. Itens antigos seguem
-- usando executedByUserId.

CREATE TABLE "executors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "executors_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "executors_status_check" CHECK ("status" IN ('ATIVO', 'INATIVO'))
);

-- Nome único sem diferenciar maiúsculas/minúsculas.
CREATE UNIQUE INDEX "executors_name_lower_key" ON "executors" (lower("name"));

ALTER TABLE "work_order_items" ADD COLUMN "executedByName" TEXT;

INSERT INTO "executors" ("id", "name") VALUES
    ('executor_mateus_cintra', 'Mateus Cintra'),
    ('executor_carlos_eduardo', 'Carlos Eduardo');
