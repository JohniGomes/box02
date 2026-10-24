import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";

export async function recordAuditLog(input: {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const id = createId();
  await pool.query(
    `INSERT INTO audit_logs (id, "userId", action, "entityType", "entityId", metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      input.userId ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  );
}

/** Último status para o qual a OS foi mudada pelo fluxo normal (de/para gravados no histórico). */
export async function findLastStatusChangeTarget(workOrderId: string): Promise<string | null> {
  const result = await pool.query<{ to: string | null }>(
    `SELECT metadata->>'to' AS "to" FROM audit_logs
     WHERE "entityType" = 'work_order' AND "entityId" = $1 AND action = 'WORK_ORDER_STATUS_CHANGED'
     ORDER BY "createdAt" DESC LIMIT 1`,
    [workOrderId],
  );
  return result.rows[0]?.to ?? null;
}

export interface EntityAuditEntry {
  id: string;
  action: string;
  createdAt: Date;
  userName: string | null;
  metadata: Record<string, unknown> | null;
}

/** Registros de auditoria de uma entidade, só das ações pedidas (mais recentes primeiro). */
export async function listAuditLogsForEntity(
  entityType: string,
  entityId: string,
  actions: string[],
): Promise<EntityAuditEntry[]> {
  const result = await pool.query<EntityAuditEntry>(
    `SELECT a.id, a.action, a."createdAt", u.name AS "userName", a.metadata
     FROM audit_logs a LEFT JOIN users u ON u.id = a."userId"
     WHERE a."entityType" = $1 AND a."entityId" = $2 AND a.action = ANY($3::text[])
     ORDER BY a."createdAt" DESC`,
    [entityType, entityId, actions],
  );
  return result.rows;
}
