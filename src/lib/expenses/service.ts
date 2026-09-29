import { withTransaction } from "@/lib/db/transaction";
import {
  createExpense,
  findExpenseById,
  listExpenses,
  lockExpenseById,
  markExpenseAsPaid,
  updateExpense,
  type ExpenseRecord,
} from "@/lib/db/repositories/expenses";
import { recordAuditLog } from "@/lib/db/repositories/auditLog";
import { reaisToCents } from "@/lib/money";
import { createExpenseSchema, markExpenseAsPaidSchema, updateExpenseSchema } from "@/lib/validation/expenses";
import { ExpenseAlreadyPaidError, ExpenseNotFoundError } from "./errors";

/** Ciclo M — Financeiro completo (Fatia 1): despesas/contas a pagar,
 * independentes de OS. `status` (PENDENTE/PAGA/ATRASADA) é sempre
 * derivado na leitura, nunca armazenado — mesmo padrão já usado no
 * status financeiro da OS (Ciclo I). */
export interface ExpenseView extends ExpenseRecord {
  status: "PENDENTE" | "PAGA" | "ATRASADA";
}

function toView(expense: ExpenseRecord): ExpenseView {
  if (expense.paidAt) return { ...expense, status: "PAGA" };
  const today = new Date().toISOString().slice(0, 10);
  const status = expense.dueDate < today ? "ATRASADA" : "PENDENTE";
  return { ...expense, status };
}

export async function listExpensesService(): Promise<ExpenseView[]> {
  const expenses = await listExpenses();
  return expenses.map(toView);
}

export async function createExpenseService(actorUserId: string, rawInput: unknown): Promise<ExpenseView> {
  const input = createExpenseSchema.parse(rawInput);
  const amountCents = reaisToCents(input.amountReais);
  if (amountCents <= 0) {
    throw new Error("O valor da despesa precisa ser maior que zero.");
  }

  const expense = await createExpense({
    category: input.category,
    description: input.description,
    supplierName: input.supplierName ?? null,
    amountCents,
    dueDate: input.dueDate,
    notes: input.notes ?? null,
    createdByUserId: actorUserId,
  });

  await recordAuditLog({
    userId: actorUserId,
    action: "EXPENSE_CREATED",
    entityType: "expense",
    entityId: expense.id,
    metadata: { category: expense.category, amountCents, dueDate: expense.dueDate },
  });

  return toView(expense);
}

/** Correção de valor/descrição — só permitida enquanto a despesa ainda
 * está PENDENTE (ou ATRASADA, que é a mesma coisa sem paidAt). */
export async function updateExpenseService(
  actorUserId: string,
  expenseId: string,
  rawInput: unknown,
): Promise<ExpenseView> {
  const input = updateExpenseSchema.parse(rawInput);
  const amountCents = reaisToCents(input.amountReais);
  if (amountCents <= 0) {
    throw new Error("O valor da despesa precisa ser maior que zero.");
  }

  return withTransaction(async (client) => {
    const expense = await lockExpenseById(expenseId, client);
    if (!expense) throw new ExpenseNotFoundError(expenseId);
    if (expense.paidAt) throw new ExpenseAlreadyPaidError();

    const updated = await updateExpense(
      expenseId,
      {
        category: input.category,
        description: input.description,
        supplierName: input.supplierName ?? null,
        amountCents,
        dueDate: input.dueDate,
        notes: input.notes ?? null,
      },
      client,
    );
    if (!updated) throw new ExpenseNotFoundError(expenseId);

    await recordAuditLog({
      userId: actorUserId,
      action: "EXPENSE_UPDATED",
      entityType: "expense",
      entityId: expenseId,
      metadata: { category: updated.category, amountCents, dueDate: updated.dueDate },
    });

    return toView(updated);
  });
}

export async function markExpenseAsPaidService(
  actorUserId: string,
  expenseId: string,
  rawInput: unknown,
): Promise<ExpenseView> {
  const input = markExpenseAsPaidSchema.parse(rawInput);

  return withTransaction(async (client) => {
    const expense = await lockExpenseById(expenseId, client);
    if (!expense) throw new ExpenseNotFoundError(expenseId);
    if (expense.paidAt) throw new ExpenseAlreadyPaidError();

    const updated = await markExpenseAsPaid(
      expenseId,
      { paidAt: new Date(), paymentMethod: input.paymentMethod },
      client,
    );
    if (!updated) throw new ExpenseNotFoundError(expenseId);

    await recordAuditLog({
      userId: actorUserId,
      action: "EXPENSE_PAID",
      entityType: "expense",
      entityId: expenseId,
      metadata: { paymentMethod: input.paymentMethod },
    });

    return toView(updated);
  });
}

export async function getExpenseService(expenseId: string): Promise<ExpenseView | null> {
  const expense = await findExpenseById(expenseId);
  return expense ? toView(expense) : null;
}
