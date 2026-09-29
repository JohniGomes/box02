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
