import type { Pool, PoolClient } from "pg";
import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";

type Queryable = Pool | PoolClient;

export type ReconciliationEntryType = "RECEBIMENTO" | "DESPESA";

export interface BankReconciliationRecord {
  id: string;
  entryType: ReconciliationEntryType;
  paymentId: string | null;
  expenseId: string | null;
  reconciledAt: Date;
  reconciledByUserId: string;
  createdAt: Date;
}

const COLUMNS = `
  id, "entryType", "paymentId", "expenseId", "reconciledAt", "reconciledByUserId", "createdAt"
`;

export async function createReconciliation(
  input: {
    entryType: ReconciliationEntryType;
    paymentId?: string | null;
    expenseId?: string | null;
    reconciledByUserId: string;
  },
  db: Queryable = pool,
): Promise<BankReconciliationRecord> {
  const id = createId();
  const result = await db.query<BankReconciliationRecord>(
    `INSERT INTO bank_reconciliations (id, "entryType", "paymentId", "expenseId", "reconciledByUserId")
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLUMNS}`,
    [id, input.entryType, input.paymentId ?? null, input.expenseId ?? null, input.reconciledByUserId],
  );
  return result.rows[0];
}

export async function findReconciliationByPaymentId(
  paymentId: string,
  db: Queryable = pool,
): Promise<BankReconciliationRecord | null> {
  const result = await db.query<BankReconciliationRecord>(
    `SELECT ${COLUMNS} FROM bank_reconciliations WHERE "paymentId" = $1`,
    [paymentId],
  );
  return result.rows[0] ?? null;
}

export async function findReconciliationByExpenseId(
  expenseId: string,
  db: Queryable = pool,
): Promise<BankReconciliationRecord | null> {
  const result = await db.query<BankReconciliationRecord>(
    `SELECT ${COLUMNS} FROM bank_reconciliations WHERE "expenseId" = $1`,
    [expenseId],
  );
  return result.rows[0] ?? null;
}

export async function deleteReconciliationByPaymentId(paymentId: string, db: Queryable = pool): Promise<boolean> {
  const result = await db.query(`DELETE FROM bank_reconciliations WHERE "paymentId" = $1`, [paymentId]);
  return (result.rowCount ?? 0) > 0;
}

export async function deleteReconciliationByExpenseId(expenseId: string, db: Queryable = pool): Promise<boolean> {
  const result = await db.query(`DELETE FROM bank_reconciliations WHERE "expenseId" = $1`, [expenseId]);
  return (result.rowCount ?? 0) > 0;
}

export interface ReconciliationPaymentRow {
  id: string;
  amountCents: number;
  method: string;
  notes: string | null;
  receivedAt: Date;
  workOrderNumber: string;
  customerNameSnapshot: string;
  reconciledAt: Date | null;
}

/** Recebimentos com data dentro do período — sempre representam
 * dinheiro que já entrou no caixa, por isso são sempre elegíveis para
 * conciliação (diferente de despesa, que só entra depois de paga). */
export async function listPaymentsForReconciliation(
  fromDate: string,
  toDate: string,
  db: Queryable = pool,
): Promise<ReconciliationPaymentRow[]> {
  const result = await db.query<ReconciliationPaymentRow>(
    `SELECT
      p.id, p."amountCents", p.method, p.notes, p."receivedAt",
      wo.number as "workOrderNumber", wo."customerNameSnapshot",
      r."reconciledAt"
     FROM work_order_payments p
     JOIN work_orders wo ON wo.id = p."workOrderId"
     LEFT JOIN bank_reconciliations r ON r."paymentId" = p.id
     WHERE p."receivedAt" >= $1::date AND p."receivedAt" < ($2::date + INTERVAL '1 day')
     ORDER BY p."receivedAt" ASC`,
    [fromDate, toDate],
  );
  return result.rows;
}

export interface ReconciliationExpenseRow {
  id: string;
  description: string;
  category: string;
  amountCents: number;
  paidAt: Date;
  paymentMethod: string;
  reconciledAt: Date | null;
}

/** Só despesas já pagas (`paidAt` preenchido) — uma despesa pendente
 * ainda não representa uma saída real de caixa, então não entra na
 * conciliação. */
export async function listPaidExpensesForReconciliation(
  fromDate: string,
  toDate: string,
  db: Queryable = pool,
): Promise<ReconciliationExpenseRow[]> {
  const result = await db.query<ReconciliationExpenseRow>(
    `SELECT
      e.id, e.description, e.category, e."amountCents", e."paidAt", e."paymentMethod",
      r."reconciledAt"
     FROM expenses e
     LEFT JOIN bank_reconciliations r ON r."expenseId" = e.id
     WHERE e."paidAt" IS NOT NULL
       AND e."paidAt" >= $1::date AND e."paidAt" < ($2::date + INTERVAL '1 day')
     ORDER BY e."paidAt" ASC`,
    [fromDate, toDate],
  );
  return result.rows;
}
