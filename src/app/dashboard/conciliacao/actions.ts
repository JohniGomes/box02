"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { reconcileEntryService, undoReconciliationService } from "@/lib/reconciliation/service";
import { ExpenseNotPaidError, ReconciliationEntryNotFoundError } from "@/lib/reconciliation/errors";
import type { ReconciliationEntryType } from "@/lib/db/repositories/bankReconciliations";

export interface ReconciliationActionResult {
  success: boolean;
  error?: string;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado.");
  return session.user.id;
}

function friendlyError(err: unknown, fallback: string): ReconciliationActionResult {
  if (err instanceof ReconciliationEntryNotFoundError || err instanceof ExpenseNotPaidError) {
    return { success: false, error: err.message };
  }
  return { success: false, error: fallback };
}

export async function reconcileEntryAction(
  entryType: ReconciliationEntryType,
  entryId: string,
): Promise<ReconciliationActionResult> {
  try {
    const userId = await requireUserId();
    await reconcileEntryService(userId, entryType, entryId);
    revalidatePath("/dashboard/conciliacao");
    return { success: true };
  } catch (err) {
    return friendlyError(err, "Não foi possível conciliar este lançamento.");
  }
}

export async function undoReconciliationAction(
  entryType: ReconciliationEntryType,
  entryId: string,
): Promise<ReconciliationActionResult> {
  try {
    const userId = await requireUserId();
    await undoReconciliationService(userId, entryType, entryId);
    revalidatePath("/dashboard/conciliacao");
    return { success: true };
  } catch (err) {
    return friendlyError(err, "Não foi possível desfazer a conciliação.");
  }
}
