import { withTransaction } from "@/lib/db/transaction";
import {
  createExpense,
  deleteUnpaidExpense,
  existsEqualExpense,
  findExpenseById,
  hasBankReconciliation,
  listExpenses,
  lockExpenseById,
  markExpenseAsPaid,
  unmarkExpenseAsPaid,
  updateExpense,
  type ExpenseRecord,
} from "@/lib/db/repositories/expenses";
import { addOneMonth, noonInBrasilia, todayInBrasilia } from "./dates";
import { recordAuditLog } from "@/lib/db/repositories/auditLog";
import { reaisToCents } from "@/lib/money";
import { createExpenseSchema, markExpenseAsPaidSchema, updateExpenseSchema } from "@/lib/validation/expenses";
import {
  ExpenseAlreadyPaidError,
  ExpenseDuplicateError,
  ExpenseNotFoundError,
  ExpenseNotPaidError,
  ExpensePaidInFutureError,
  ExpenseReconciledError,
} from "./errors";

/** Ciclo M — Financeiro completo (Fatia 1): despesas/contas a pagar,
 * independentes de OS. `status` (PENDENTE/PAGA/ATRASADA) é sempre
 * derivado na leitura, nunca armazenado — mesmo padrão já usado no
 * status financeiro da OS (Ciclo I). */
export interface ExpenseView extends ExpenseRecord {
  status: "PENDENTE" | "PAGA" | "ATRASADA";
}

function toView(expense: ExpenseRecord): ExpenseView {
  if (expense.paidAt) return { ...expense, status: "PAGA" };
  // "Hoje" no horário de Brasília (em UTC, depois das 21h já seria amanhã e
  // uma conta que vence hoje apareceria como atrasada).
  const today = todayInBrasilia();
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

    // Data da baixa: a informada (para lançar pagamento de outro dia) ou agora.
    let paidAt = new Date();
    if (input.paidOn) {
      if (input.paidOn > todayInBrasilia()) throw new ExpensePaidInFutureError();
      paidAt = noonInBrasilia(input.paidOn);
    }

    const updated = await markExpenseAsPaid(expenseId, { paidAt, paymentMethod: input.paymentMethod }, client);
    if (!updated) throw new ExpenseNotFoundError(expenseId);

    await recordAuditLog({
      userId: actorUserId,
      action: "EXPENSE_PAID",
      entityType: "expense",
      entityId: expenseId,
      metadata: { paymentMethod: input.paymentMethod, paidOn: input.paidOn ?? null },
    });

    return toView(updated);
  });
}

/**
 * Exclui uma despesa que ainda NÃO foi paga (ex.: conta lançada por engano ou
 * repetida para o mês seguinte sem necessidade). Despesa já paga não pode ser
 * excluída — primeiro desfaz-se o pagamento. Fica registrado no histórico.
 */
export async function deleteExpenseService(actorUserId: string, expenseId: string): Promise<void> {
  await withTransaction(async (client) => {
    const expense = await lockExpenseById(expenseId, client);
    if (!expense) throw new ExpenseNotFoundError(expenseId);
    if (expense.paidAt) throw new ExpenseAlreadyPaidError();
    if (await hasBankReconciliation(expenseId, client)) throw new ExpenseReconciledError();

    const deleted = await deleteUnpaidExpense(expenseId, client);
    if (!deleted) throw new ExpenseNotFoundError(expenseId);

    await recordAuditLog({
      userId: actorUserId,
      action: "EXPENSE_DELETED",
      entityType: "expense",
      entityId: expenseId,
      metadata: {
        category: expense.category,
        description: expense.description,
        amountCents: expense.amountCents,
        dueDate: expense.dueDate,
      },
    });
  });
}

/**
 * Desfaz um pagamento marcado por engano: a despesa volta a "em aberto" e
 * pode ser editada/paga de novo. Fica registrado quem desfez e o que havia
 * sido gravado (data e forma). Bloqueado se já foi conciliada com o banco.
 */
export async function unmarkExpenseAsPaidService(actorUserId: string, expenseId: string): Promise<ExpenseView> {
  return withTransaction(async (client) => {
    const expense = await lockExpenseById(expenseId, client);
    if (!expense) throw new ExpenseNotFoundError(expenseId);
    if (!expense.paidAt) throw new ExpenseNotPaidError();
    if (await hasBankReconciliation(expenseId, client)) throw new ExpenseReconciledError();

    const updated = await unmarkExpenseAsPaid(expenseId, client);
    if (!updated) throw new ExpenseNotFoundError(expenseId);

    await recordAuditLog({
      userId: actorUserId,
      action: "EXPENSE_UNPAID",
      entityType: "expense",
      entityId: expenseId,
      metadata: { previousPaidAt: expense.paidAt, previousPaymentMethod: expense.paymentMethod },
    });

    return toView(updated);
  });
}

/**
 * Cria a mesma despesa para o mês seguinte (mesmo dia; mês mais curto usa o
 * último dia). Serve para contas fixas: ao pagar a de outubro, repete para
 * novembro com um toque. Recusa criar se já existir uma igual nesse
 * vencimento (evita duplicar ao clicar duas vezes).
 */
export async function repeatExpenseNextMonthService(actorUserId: string, expenseId: string): Promise<ExpenseView> {
  const source = await findExpenseById(expenseId);
  if (!source) throw new ExpenseNotFoundError(expenseId);

  const dueDate = addOneMonth(source.dueDate);
  if (
    await existsEqualExpense({
      category: source.category,
      description: source.description,
      amountCents: source.amountCents,
      dueDate,
    })
  ) {
    throw new ExpenseDuplicateError(dueDate);
  }

  const created = await createExpense({
    category: source.category,
    description: source.description,
    supplierName: source.supplierName,
    amountCents: source.amountCents,
    dueDate,
    notes: source.notes,
    createdByUserId: actorUserId,
  });

  await recordAuditLog({
    userId: actorUserId,
    action: "EXPENSE_REPEATED",
    entityType: "expense",
    entityId: created.id,
    metadata: { fromExpenseId: expenseId, dueDate },
  });

  return toView(created);
}

export async function getExpenseService(expenseId: string): Promise<ExpenseView | null> {
  const expense = await findExpenseById(expenseId);
  return expense ? toView(expense) : null;
}
