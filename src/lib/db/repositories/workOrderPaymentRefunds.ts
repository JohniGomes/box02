import type { Pool, PoolClient } from "pg";
import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";

type Queryable = Pool | PoolClient;

export interface WorkOrderPaymentRefundRecord {
  id: string;
  paymentId: string;
  workOrderId: string;
  refundCents: number;
  reason: string;
  refundedByUserId: string;
  createdAt: Date;
}

const COLUMNS = `
  id, "paymentId", "workOrderId", "refundCents", reason, "refundedByUserId", "createdAt"
`;

/** DEC-I6 revisitada (Ciclo M): o recebimento original nunca é editado
 * nem apagado — o estorno é sempre um INSERT novo e separado. */
export async function createWorkOrderPaymentRefund(
  input: {
    paymentId: string;
    workOrderId: string;
    refundCents: number;
    reason: string;
    refundedByUserId: string;
  },
  db: Queryable = pool,
): Promise<WorkOrderPaymentRefundRecord> {
  const id = createId();
  const result = await db.query<WorkOrderPaymentRefundRecord>(
    `INSERT INTO work_order_payment_refunds
      (id, "paymentId", "workOrderId", "refundCents", reason, "refundedByUserId")
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${COLUMNS}`,
    [id, input.paymentId, input.workOrderId, input.refundCents, input.reason, input.refundedByUserId],
  );
  return result.rows[0];
}

export async function listWorkOrderPaymentRefundsByWorkOrder(
  workOrderId: string,
  db: Queryable = pool,
): Promise<WorkOrderPaymentRefundRecord[]> {
  const result = await db.query<WorkOrderPaymentRefundRecord>(
    `SELECT ${COLUMNS} FROM work_order_payment_refunds WHERE "workOrderId" = $1 ORDER BY "createdAt" ASC`,
    [workOrderId],
  );
  return result.rows;
}

/** Soma já estornada de UM recebimento específico — usada para validar
 * que um novo estorno não ultrapassa o valor original do recebimento. */
export async function sumRefundsForPayment(paymentId: string, db: Queryable = pool): Promise<number> {
  const result = await db.query<{ total: string | null }>(
    `SELECT COALESCE(SUM("refundCents"), 0) as total FROM work_order_payment_refunds WHERE "paymentId" = $1`,
    [paymentId],
  );
  return Number(result.rows[0]?.total ?? 0);
}

/** Soma de todos os estornos de uma OS — usada para descontar do total
 * recebido (ver `sumWorkOrderPayments`, que já retorna o líquido). */
export async function sumRefundsForWorkOrder(workOrderId: string, db: Queryable = pool): Promise<number> {
  const result = await db.query<{ total: string | null }>(
    `SELECT COALESCE(SUM("refundCents"), 0) as total FROM work_order_payment_refunds WHERE "workOrderId" = $1`,
    [workOrderId],
  );
  return Number(result.rows[0]?.total ?? 0);
}
