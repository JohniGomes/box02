import type { Pool, PoolClient } from "pg";
import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";

type Queryable = Pool | PoolClient;

export interface WorkOrderDiscountRecord {
  id: string;
  workOrderId: string;
  amountCents: number;
  reason: string | null;
  createdByUserId: string;
  createdAt: Date;
}

const COLUMNS = `id, "workOrderId", "amountCents", reason, "createdByUserId", "createdAt"`;

/** Desconto dado no recebimento: só se acrescenta, nunca se edita nem apaga. */
export async function createWorkOrderDiscount(
  input: { workOrderId: string; amountCents: number; reason: string | null; createdByUserId: string },
  db: Queryable = pool,
): Promise<WorkOrderDiscountRecord> {
  const result = await db.query<WorkOrderDiscountRecord>(
    `INSERT INTO work_order_discounts (id, "workOrderId", "amountCents", reason, "createdByUserId")
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLUMNS}`,
    [createId(), input.workOrderId, input.amountCents, input.reason, input.createdByUserId],
  );
  return result.rows[0];
}

export async function listWorkOrderDiscounts(workOrderId: string, db: Queryable = pool): Promise<WorkOrderDiscountRecord[]> {
  const result = await db.query<WorkOrderDiscountRecord>(
    `SELECT ${COLUMNS} FROM work_order_discounts WHERE "workOrderId" = $1 ORDER BY "createdAt" ASC`,
    [workOrderId],
  );
  return result.rows;
}

export async function sumWorkOrderDiscounts(workOrderId: string, db: Queryable = pool): Promise<number> {
  const result = await db.query<{ total: string | null }>(
    `SELECT COALESCE(SUM("amountCents"), 0) AS total FROM work_order_discounts WHERE "workOrderId" = $1`,
    [workOrderId],
  );
  return Number(result.rows[0]?.total ?? 0);
}
