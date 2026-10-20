-- Migração 0026 — Log de alterações direto no banco (forense)
--
-- Contexto: dados de produção foram apagados sem passar pelo app (ver
-- TECH_DEBT.md se existir, ou histórico do PR) — nem o audit_logs da
-- aplicação nem o Supabase (plano Free, sem backup) tinham qualquer
-- rastro de quem/quando. Este log captura TODA alteração (INSERT,
-- UPDATE, DELETE e TRUNCATE) nas tabelas de negócio, não só o que passa
-- pela aplicação — cobre também edições feitas direto no Table Editor do
-- Supabase ou por qualquer outra conexão.
--
-- Nunca é apagado por este sistema (sem FK, sem CASCADE apontando pra
-- ele) e nenhuma tabela de negócio referencia esta — write-only por
-- natureza. Guarda a linha inteira (old/new) como jsonb, então também
-- serve como forma manual de "desfazer" um DELETE/TRUNCATE indevido
-- (os dados ficam em old_data, é só reinserir).

CREATE TABLE "db_change_log" (
    "id" BIGSERIAL PRIMARY KEY,
    "tableName" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "rowId" TEXT,
    "oldData" JSONB,
    "newData" JSONB,
    "dbUser" TEXT NOT NULL,
    "clientAddr" TEXT,
    "changedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "db_change_log_tableName_idx" ON "db_change_log"("tableName");
CREATE INDEX "db_change_log_changedAt_idx" ON "db_change_log"("changedAt");

CREATE OR REPLACE FUNCTION log_table_change() RETURNS trigger AS $$
DECLARE
  row_data JSONB := to_jsonb(COALESCE(NEW, OLD));
BEGIN
  INSERT INTO "db_change_log" ("tableName", "operation", "rowId", "oldData", "newData", "dbUser", "clientAddr")
  VALUES (
    TG_TABLE_NAME,
    TG_OP,
    COALESCE(row_data->>'id', row_data->>'key'),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('UPDATE', 'INSERT') THEN to_jsonb(NEW) ELSE NULL END,
    current_user,
    COALESCE(inet_client_addr()::text, 'local')
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- TRUNCATE não dispara trigger de linha (AFTER INSERT/UPDATE/DELETE) —
-- precisa de um trigger de ESTRUTURA separado. Foi exatamente um TRUNCATE
-- (dos testes de integração, sem banco de teste separado) que causou o
-- incidente original — este é o caso mais importante de capturar.
CREATE OR REPLACE FUNCTION log_table_truncate() RETURNS trigger AS $$
BEGIN
  INSERT INTO "db_change_log" ("tableName", "operation", "dbUser", "clientAddr")
  VALUES (TG_TABLE_NAME, 'TRUNCATE', current_user, COALESCE(inet_client_addr()::text, 'local'));
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'roles', 'permissions', 'user_roles', 'role_permissions',
    'customers', 'vehicles',
    'services', 'procedures', 'checklists', 'checklist_items',
    'quotes', 'quote_versions', 'quote_items', 'quote_approvals', 'quote_access_links',
    'work_orders', 'work_order_items', 'work_order_closures',
    'work_order_checklists', 'work_order_checklist_items', 'work_order_evidences',
    'work_order_payments', 'work_order_payment_refunds',
    'expenses', 'bank_reconciliations', 'appointments',
    'parts', 'stock_movements', 'app_settings', 'service_requests'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION log_table_change()',
      'trg_' || t || '_change_log', t
    );
    EXECUTE format(
      'CREATE TRIGGER %I AFTER TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION log_table_truncate()',
      'trg_' || t || '_truncate_log', t
    );
  END LOOP;
END $$;
