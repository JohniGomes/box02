-- Migração 0011 — Execução Operacional / Ciclo D: Checklists e Procedimentos
-- Escopo: cadastro apenas. Nenhuma tabela de OS é tocada ou referenciada.

CREATE TYPE "ProcedureStatus" AS ENUM ('ATIVO', 'INATIVO');
CREATE TYPE "ChecklistStatus" AS ENUM ('ATIVO', 'INATIVO');
CREATE TYPE "ChecklistType" AS ENUM ('ENTRADA', 'EXECUCAO', 'ENTREGA');

CREATE TABLE "procedures" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT,
    "prerequisites" TEXT,
    "steps" TEXT,
    "completionCriteria" TEXT,
    "status" "ProcedureStatus" NOT NULL DEFAULT 'ATIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "procedures_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "procedures_code_key" ON "procedures"("code");

CREATE TABLE "checklists" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ChecklistType" NOT NULL,
    "status" "ChecklistStatus" NOT NULL DEFAULT 'ATIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "checklists_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "checklists_code_key" ON "checklists"("code");
CREATE INDEX "checklists_type_status_idx" ON "checklists"("type", "status");

CREATE TABLE "checklist_items" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "checklist_items_checklistId_idx" ON "checklist_items"("checklistId");
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_checklistId_fkey"
    FOREIGN KEY ("checklistId") REFERENCES "checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "services" ADD COLUMN "procedureId" TEXT;
ALTER TABLE "services" ADD CONSTRAINT "services_procedureId_fkey"
    FOREIGN KEY ("procedureId") REFERENCES "procedures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "services" ADD COLUMN "executionChecklistId" TEXT;
ALTER TABLE "services" ADD CONSTRAINT "services_executionChecklistId_fkey"
    FOREIGN KEY ("executionChecklistId") REFERENCES "checklists"("id") ON DELETE SET NULL ON UPDATE CASCADE;
