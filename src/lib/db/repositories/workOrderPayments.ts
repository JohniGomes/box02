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
  /** Taxa da maquininha repassada ao cliente (cartão). O cliente passou amountCents + cardFeeCents. Nulo = sem taxa registrada. */
  cardFeeCents: number | null;
  installments: number | null;
}

const COLUMNS = `
  id, "workOrderId", "amountCents", method, notes, "receivedAt",
  "registeredByUserId", "createdAt", "cardFeeCents", installments
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
    /** Data real do recebimento; sem ela, vale o momento do lançamento. */
    receivedAt?: Date | null;
    /** Só cartão: taxa da maquininha repassada ao cliente e número de parcelas. */
    cardFeeCents?: number | null;
    installments?: number | null;
  },
  db: Queryable = pool,
): Promise<WorkOrderPaymentRecord> {
  const id = createId();
  const result = await db.query<WorkOrderPaymentRecord>(
    `INSERT INTO work_order_payments (id, "workOrderId", "amountCents", method, notes, "registeredByUserId", "receivedAt", "cardFeeCents", installments)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamp, CURRENT_TIMESTAMP), $8, $9)
     RETURNING ${COLUMNS}`,
    [
      id,
      input.workOrderId,
      input.amountCents,
      input.method,
      input.notes ?? null,
      input.registeredByUserId,
      input.receivedAt ?? null,
      input.cardFeeCents ?? null,
      input.installments ?? null,
    ],
  );
  return result.rows[0];
}

/**
 * Registra (ou apaga, com nulo) a taxa da maquininha e as parcelas de um recebimento no cartão já feito.
 * Não mexe no valor do recebimento, no saldo da OS nem em estornos: é só a informação da taxa.
 */
export async function setWorkOrderPaymentCardFee(
  id: string,
  fee: { cardFeeCents: number | null; installments: number | null },
  db: Queryable = pool,
): Promise<WorkOrderPaymentRecord | null> {
  const result = await db.query<WorkOrderPaymentRecord>(
    `UPDATE work_order_payments SET "cardFeeCents" = $2, installments = $3 WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, fee.cardFeeCents, fee.installments],
  );
  return result.rows[0] ?? null;
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

/**
 * Total pago no cartão nesta OS, já sem os estornos (base da taxa ESTIMADA da maquininha).
 * Recebimentos que já têm a taxa repassada registrada ficam de fora: neles a oficina não paga a taxa.
 */
export async function sumCardPaymentsNet(workOrderId: string, db: Queryable = pool): Promise<number> {
  const result = await db.query<{ net: string | null }>(
    `SELECT
       COALESCE((SELECT SUM(p."amountCents") FROM work_order_payments p WHERE p."workOrderId" = $1 AND p.method = 'CARTAO' AND p."cardFeeCents" IS NULL), 0)
       - COALESCE((SELECT SUM(r."refundCents") FROM work_order_payment_refunds r
                   JOIN work_order_payments p ON p.id = r."paymentId"
                   WHERE p."workOrderId" = $1 AND p.method = 'CARTAO' AND p."cardFeeCents" IS NULL), 0) AS net`,
    [workOrderId],
  );
  return Number(result.rows[0]?.net ?? 0);
}
