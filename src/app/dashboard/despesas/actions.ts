"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/auth";
import { createExpenseService, markExpenseAsPaidService, updateExpenseService } from "@/lib/expenses/service";
import { ExpenseAlreadyPaidError, ExpenseNotFoundError } from "@/lib/expenses/errors";

export interface ExpenseActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  expenseId?: string;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado.");
  return session.user.id;
}

function friendlyError(err: unknown, fallback: string): ExpenseActionResult {
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "_root";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { success: false, error: "Existem campos inválidos.", fieldErrors };
  }
  if (err instanceof ExpenseNotFoundError || err instanceof ExpenseAlreadyPaidError) {
    return { success: false, error: err.message };
  }
  return { success: false, error: fallback };
}

export async function createExpenseAction(input: unknown): Promise<ExpenseActionResult> {
  try {
    const userId = await requireUserId();
    const expense = await createExpenseService(userId, input);
    revalidatePath("/dashboard/despesas");
    return { success: true, expenseId: expense.id };
  } catch (err) {
    return friendlyError(err, "Não foi possível registrar a despesa.");
  }
}

export async function updateExpenseAction(expenseId: string, input: unknown): Promise<ExpenseActionResult> {
  try {
    const userId = await requireUserId();
    await updateExpenseService(userId, expenseId, input);
    revalidatePath("/dashboard/despesas");
    return { success: true, expenseId };
  } catch (err) {
    return friendlyError(err, "Não foi possível corrigir a despesa.");
  }
}

export async function markExpenseAsPaidAction(expenseId: string, paymentMethod: string): Promise<ExpenseActionResult> {
  try {
    const userId = await requireUserId();
    await markExpenseAsPaidService(userId, expenseId, { paymentMethod });
    revalidatePath("/dashboard/despesas");
    return { success: true, expenseId };
  } catch (err) {
    return friendlyError(err, "Não foi possível marcar a despesa como paga.");
  }
}
