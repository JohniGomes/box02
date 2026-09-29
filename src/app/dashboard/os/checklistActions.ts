"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  checkWorkOrderChecklistItemService,
  completeWorkOrderChecklistService,
  startWorkOrderChecklistService,
} from "@/lib/workOrders/checklistService";
import {
  NoChecklistTemplateAvailableError,
  WorkOrderChecklistItemNotFoundError,
  WorkOrderChecklistNotFoundError,
  WorkOrderItemNotFoundError,
  WorkOrderNotFoundError,
} from "@/lib/workOrders/errors";

export interface WorkOrderChecklistActionResult {
  success: boolean;
  error?: string;
  checklistId?: string;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado.");
  return session.user.id;
}

function friendlyError(err: unknown, fallback: string): WorkOrderChecklistActionResult {
  if (
    err instanceof NoChecklistTemplateAvailableError ||
    err instanceof WorkOrderChecklistItemNotFoundError ||
    err instanceof WorkOrderChecklistNotFoundError ||
    err instanceof WorkOrderItemNotFoundError ||
    err instanceof WorkOrderNotFoundError
  ) {
    return { success: false, error: err.message };
  }
  return { success: false, error: fallback };
}

export async function startWorkOrderChecklistAction(
  workOrderId: string,
  type: "ENTRADA" | "EXECUCAO" | "ENTREGA",
  workOrderItemId?: string,
): Promise<WorkOrderChecklistActionResult> {
  try {
    const userId = await requireUserId();
    const result = await startWorkOrderChecklistService(userId, workOrderId, type, workOrderItemId);
    revalidatePath(`/dashboard/os/${workOrderId}`);
    return { success: true, checklistId: result.checklist.id };
  } catch (err) {
    return friendlyError(err, "Não foi possível iniciar o checklist.");
  }
}

export async function checkWorkOrderChecklistItemAction(
  workOrderId: string,
  workOrderChecklistId: string,
  itemId: string,
  checked: boolean,
): Promise<WorkOrderChecklistActionResult> {
  try {
    const userId = await requireUserId();
    await checkWorkOrderChecklistItemService(userId, workOrderChecklistId, itemId, checked);
    revalidatePath(`/dashboard/os/${workOrderId}`);
    return { success: true, checklistId: workOrderChecklistId };
  } catch (err) {
    return friendlyError(err, "Não foi possível atualizar o item.");
  }
}

export async function completeWorkOrderChecklistAction(
  workOrderId: string,
  workOrderChecklistId: string,
): Promise<WorkOrderChecklistActionResult> {
  try {
    const userId = await requireUserId();
    await completeWorkOrderChecklistService(userId, workOrderChecklistId);
    revalidatePath(`/dashboard/os/${workOrderId}`);
    return { success: true, checklistId: workOrderChecklistId };
  } catch (err) {
    return friendlyError(err, "Não foi possível finalizar o checklist.");
  }
}
