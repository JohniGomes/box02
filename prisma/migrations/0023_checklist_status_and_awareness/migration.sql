-- Migração 0023 — Checklist com 3 estados + observação, e Ciência do
-- Cliente no Termo de Recepção
--
-- Alinha o sistema aos formulários em papel já validados por Paty,
-- sócios e advogada (CHK-001/CHK-006 e Termo de Recepção): cada item
-- de checklist passa a aceitar OK/Atenção/N/A (não só marcado/
-- desmarcado) e uma observação em texto livre. `checked` continua
-- existindo e sendo a fonte da regra "obrigatório pendente" — é só
-- derivado de `status` agora (não nulo = resolvido), em vez de
-- alternado direto por um checkbox.
ALTER TABLE "work_order_checklist_items" ADD COLUMN "status" TEXT;
ALTER TABLE "work_order_checklist_items" ADD CONSTRAINT "work_order_checklist_items_status_check"
    CHECK ("status" IS NULL OR "status" IN ('OK', 'ATENCAO', 'NA'));
ALTER TABLE "work_order_checklist_items" ADD COLUMN "observacao" TEXT;

-- Ciência do cliente — as 3 cláusulas do Termo de Recepção (texto
-- validado, ver docs/BRIEFING_BOX02_IDENTIDADE_OPERACAO.md e o PDF
-- modelo). Precisam ser confirmadas (true) antes do aceite de
-- recepção poder ser registrado. Default false: OS antigas, que nunca
-- tiveram essa tela, ficam corretamente marcadas como "não
-- confirmado" (nunca inventa um "sim" retroativo).
ALTER TABLE "work_orders" ADD COLUMN "receptionAwareness1" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "work_orders" ADD COLUMN "receptionAwareness2" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "work_orders" ADD COLUMN "receptionAwareness3" BOOLEAN NOT NULL DEFAULT false;
