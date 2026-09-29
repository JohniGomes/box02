-- Migração 0005 — Ciclo 4 / Sub-etapa 2: Link público e aprovação
-- Corresponde exatamente ao schema.prisma (QuoteApproval, QuoteAccessLink).
-- Ver nota sobre migrações manuais em TECH_DEBT.md (DT1).

CREATE TYPE "QuoteApprovalDecision" AS ENUM ('APROVADO', 'APROVADO_PARCIAL', 'RECUSADO');
CREATE TYPE "QuoteAccessChannel" AS ENUM ('LINK', 'PRESENCIAL');

CREATE TABLE "quote_approvals" (
    "id" TEXT NOT NULL,
    "quoteVersionId" TEXT NOT NULL,
    "decision" "QuoteApprovalDecision" NOT NULL,
    "approverName" TEXT NOT NULL,
    "approverDocument" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "channel" "QuoteAccessChannel" NOT NULL DEFAULT 'LINK',
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    CONSTRAINT "quote_approvals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "quote_approvals_quoteVersionId_idx" ON "quote_approvals"("quoteVersionId");

ALTER TABLE "quote_approvals" ADD CONSTRAINT "quote_approvals_quoteVersionId_fkey"
    FOREIGN KEY ("quoteVersionId") REFERENCES "quote_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "quote_access_links" (
    "id" TEXT NOT NULL,
    "quoteVersionId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "channel" "QuoteAccessChannel" NOT NULL DEFAULT 'LINK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "quote_access_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "quote_access_links_token_key" ON "quote_access_links"("token");
CREATE INDEX "quote_access_links_quoteVersionId_idx" ON "quote_access_links"("quoteVersionId");

ALTER TABLE "quote_access_links" ADD CONSTRAINT "quote_access_links_quoteVersionId_fkey"
    FOREIGN KEY ("quoteVersionId") REFERENCES "quote_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
