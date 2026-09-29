import type { Pool, PoolClient } from "pg";
import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";
import type { WorkOrderPaymentMethod } from "./workOrderPayments";

type Queryable = Pool | PoolClient;

export type ExpenseCategory =
  | "ALUGUEL"
  | "SALARIOS"
  | "FORNECEDORES"
  | "IMPOSTOS"
  | "MANUTENCAO_EQUIPAMENTOS"
  | "UTILIDADES"
  | "MARKETING"
  | "OUTROS";

export interface ExpenseRecord {
  id: string;
  category: ExpenseCategory;
  description: string;
  supplierName: string | null;
  amountCents: number;
  /** Coluna DATE do Postgres — sempre "YYYY-MM-DD", sem componente de hora. */
  dueDate: string;
  paidAt: Date | null;
  paymentMethod: WorkOrderPaymentMethod | null;
  notes: string | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

const COLUMNS = `
  id, category, description, "supplierName", "amountCents",
  to_char("dueDate", 'YYYY-MM-DD') as "dueDate", "paidAt", "paymentMethod",
  notes, "createdByUserId", "createdAt", "updatedAt"
`;

export async function createExpense(
  input: {
    category: ExpenseCategory;
    description: string;
    supplierName?: string | null;
    amountCents: number;
    dueDate: string;
    notes?: string | null;
    createdByUserId: string;
  },
  db: Queryable = pool,
): Promise<ExpenseRecord> {
  const id = createId();
  const result = await db.query<ExpenseRecord>(
    `INSERT INTO expenses
      (id, category, description, "supplierName", "amountCents", "dueDate", notes, "createdByUserId", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     RETURNING ${COLUMNS}`,
    [
      id,
      input.category,
      input.description,
      input.supplierName ?? null,
      input.amountCents,
      input.dueDate,
      input.notes ?? null,
      input.createdByUserId,
    ],
  );
  return result.rows[0];
}

export async function findExpenseById(id: string, db: Queryable = pool): Promise<ExpenseRecord | null> {
  const result = await db.query<ExpenseRecord>(`SELECT ${COLUMNS} FROM expenses WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

/** Trava a linha para a transição PENDENTE → PAGA (evita corrida de dois
 * cliques quase simultâneos marcando a mesma despesa como paga). */
export async function lockExpenseById(id: string, db: Queryable): Promise<ExpenseRecord | null> {
  const result = await db.query<ExpenseRecord>(`SELECT ${COLUMNS} FROM expenses WHERE id = $1 FOR UPDATE`, [id]);
  return result.rows[0] ?? null;
}

export async function listExpenses(db: Queryable = pool): Promise<ExpenseRecord[]> {
  const result = await db.query<ExpenseRecord>(
    `SELECT ${COLUMNS} FROM expenses ORDER BY "paidAt" IS NULL DESC, "dueDate" ASC, "createdAt" ASC`,
  );
  return result.rows;
}

export async function markExpenseAsPaid(
  id: string,
  input: { paidAt: Date; paymentMethod: WorkOrderPaymentMethod },
  db: Queryable = pool,
): Promise<ExpenseRecord | null> {
  const result = await db.query<ExpenseRecord>(
    `UPDATE expenses SET "paidAt" = $2, "paymentMethod" = $3, "updatedAt" = NOW()
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [id, input.paidAt, input.paymentMethod],
  );
  return result.rows[0] ?? null;
}

/** Correção de valor/descrição — só permitida enquanto PENDENTE (checado
 * no service, não aqui). */
export async function updateExpense(
  id: string,
  input: {
    category: ExpenseCategory;
    description: string;
    supplierName?: string | null;
    amountCents: number;
    dueDate: string;
    notes?: string | null;
  },
  db: Queryable = pool,
): Promise<ExpenseRecord | null> {
  const result = await db.query<ExpenseRecord>(
    `UPDATE expenses SET
      category = $2, description = $3, "supplierName" = $4, "amountCents" = $5,
      "dueDate" = $6, notes = $7, "updatedAt" = NOW()
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [
      id,
      input.category,
      input.description,
      input.supplierName ?? null,
      input.amountCents,
      input.dueDate,
      input.notes ?? null,
    ],
  );
  return result.rows[0] ?? null;
}
