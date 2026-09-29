"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { updateWorkOrderExplanationService, updateWorkOrderTechnicalNotesService } from "@/lib/workOrders/service";
import { WorkOrderNotFoundError } from "@/lib/workOrders/errors";

export interface MethodActionResult {
  success: boolean;
  error?: string;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado.");
  return session.user.id;
}

export async function updateExplanationAction(
  workOrderId: string,
  diagnosisExplanationNotes: string,
): Promise<MethodActionResult> {
  try {
    const userId = await requireUserId();
    await updateWorkOrderExplanationService(userId, workOrderId, { diagnosisExplanationNotes });
    revalidatePath(`/dashboard/os/${workOrderId}`);
    return { success: true };
  } catch (err) {
    if (err instanceof WorkOrderNotFoundError) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "Não foi possível salvar a explicação." };
  }
}

// ============================================================
// Ciclo G — Entrega Técnica
// ============================================================

export async function updateTechnicalNotesAction(
  workOrderId: string,
  technicalNotes: string,
): Promise<MethodActionResult> {
  try {
    const userId = await requireUserId();
    await updateWorkOrderTechnicalNotesService(userId, workOrderId, { technicalNotes });
    revalidatePath(`/dashboard/os/${workOrderId}`);
    revalidatePath(`/dashboard/os/${workOrderId}/entrega-tecnica`);
    return { success: true };
  } catch (err) {
    if (err instanceof WorkOrderNotFoundError) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "Não foi possível salvar o registro técnico." };
  }
}
