import type { Pool, PoolClient } from "pg";
import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";

type Queryable = Pool | PoolClient;

export type WorkOrderPaymentMethod = "DINHEIRO" | "PIX" | "CARTAO" | "OUTRO";

export interface WorkOrderPaymentRecord {
  id: string;
  workOrderId: string;
  amountCents: number;
  method: WorkOrderPaymentMethod;
  notes: string | null;
  receivedAt: Date;
  registeredByUserId: string;
  createdAt: Date;
}

const COLUMNS = `
  id, "workOrderId", "amountCents", method, notes, "receivedAt",
  "registeredByUserId", "createdAt"
`;

/**
 * Ciclo I — grava um recebimento. Write-once por natureza: esta função
 * só INSERE, nunca existe um `updatePayment`/`deletePayment` — corrigir
 * um lançamento errado fica para quando estorno for decidido (DEC-I6,
 * fora deste ciclo).
 */
export async function createWorkOrderPayment(
  input: {
    workOrderId: string;
    amountCents: number;
    method: WorkOrderPaymentMethod;
    notes?: string | null;
    registeredByUserId: string;
  },
  db: Queryable = pool,
): Promise<WorkOrderPaymentRecord> {
  const id = createId();
  const result = await db.query<WorkOrderPaymentRecord>(
    `INSERT INTO work_order_payments (id, "workOrderId", "amountCents", method, notes, "registeredByUserId")
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${COLUMNS}`,
    [id, input.workOrderId, input.amountCents, input.method, input.notes ?? null, input.registeredByUserId],
  );
  return result.rows[0];
}

export async function findWorkOrderPaymentById(
  id: string,
  db: Queryable = pool,
): Promise<WorkOrderPaymentRecord | null> {
  const result = await db.query<WorkOrderPaymentRecord>(`SELECT ${COLUMNS} FROM work_order_payments WHERE id = $1`, [
    id,
  ]);
  return result.rows[0] ?? null;
}

export async function listWorkOrderPayments(
  workOrderId: string,
  db: Queryable = pool,
): Promise<WorkOrderPaymentRecord[]> {
  const result = await db.query<WorkOrderPaymentRecord>(
    `SELECT ${COLUMNS} FROM work_order_payments WHERE "workOrderId" = $1 ORDER BY "receivedAt" ASC, "createdAt" ASC`,
    [workOrderId],
  );
  return result.rows;
}

/** Soma líquida calculada sob demanda — nunca armazenada (evita
 * duplicação com a soma real dos lançamentos, que é sempre a fonte da
 * verdade). Ciclo M: desconta estornos automaticamente, então o
 * saldo/status da OS reabre sozinho quando um recebimento é estornado,
 * sem precisar editar o recebimento original (que continua write-once,
 * DEC-I6) nem WorkOrderClosure. */
export async function sumWorkOrderPayments(workOrderId: string, db: Queryable = pool): Promise<number> {
  const result = await db.query<{ total: string | null }>(
    `SELECT
      COALESCE((SELECT SUM("amountCents") FROM work_order_payments WHERE "workOrderId" = $1), 0)
      - COALESCE((SELECT SUM("refundCents") FROM work_order_payment_refunds WHERE "workOrderId" = $1), 0)
      as total`,
    [workOrderId],
  );
  return Number(result.rows[0]?.total ?? 0);
}
