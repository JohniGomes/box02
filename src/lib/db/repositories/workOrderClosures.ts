import type { Pool, PoolClient } from "pg";
import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";

type Queryable = Pool | PoolClient;

export interface WorkOrderClosureRecord {
  id: string;
  workOrderId: string;
  closedAt: Date;
  closedByUserId: string;
  totalAtClosureCents: number;
  reopenedAt: Date | null;
  reopenedByUserId: string | null;
  reopenReason: string | null;
}

const COLUMNS = `
  id, "workOrderId", "closedAt", "closedByUserId", "totalAtClosureCents",
  "reopenedAt", "reopenedByUserId", "reopenReason"
`;

/**
 * Registra o fechamento de uma OS. Nesta sub-etapa só esta função é usada
 * — a reabertura (preencher reopenedAt/reopenedByUserId/reopenReason numa
 * linha já existente) chega na Sub-etapa 3.
 */
export async function createClosure(
  input: { workOrderId: string; closedByUserId: string; totalAtClosureCents: number },
  db: Queryable = pool,
): Promise<WorkOrderClosureRecord> {
  const id = createId();
  const result = await db.query<WorkOrderClosureRecord>(
    `INSERT INTO work_order_closures (id, "workOrderId", "closedByUserId", "totalAtClosureCents")
     VALUES ($1, $2, $3, $4)
     RETURNING ${COLUMNS}`,
    [id, input.workOrderId, input.closedByUserId, input.totalAtClosureCents],
  );
  return result.rows[0];
}

export async function listClosuresByWorkOrder(
  workOrderId: string,
  db: Queryable = pool,
): Promise<WorkOrderClosureRecord[]> {
  const result = await db.query<WorkOrderClosureRecord>(
    `SELECT ${COLUMNS} FROM work_order_closures WHERE "workOrderId" = $1 ORDER BY "closedAt" DESC`,
    [workOrderId],
  );
  return result.rows;
}
