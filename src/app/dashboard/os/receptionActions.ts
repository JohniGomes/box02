"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/auth";
import {
  registerWorkOrderReceptionAcceptanceService,
  updateWorkOrderCheckInSettingsService,
  updateWorkOrderReceptionInfoService,
} from "@/lib/workOrders/service";
import {
  WorkOrderNotFoundError,
  WorkOrderReceptionAlreadyAcceptedError,
  WorkOrderReceptionIncompleteError,
} from "@/lib/workOrders/errors";

export interface ReceptionActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado.");
  return session.user.id;
}

function friendlyError(err: unknown, fallback: string): ReceptionActionResult {
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "_root";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { success: false, error: "Existem campos inválidos.", fieldErrors };
  }
  if (
    err instanceof WorkOrderNotFoundError ||
    err instanceof WorkOrderReceptionAlreadyAcceptedError ||
    err instanceof WorkOrderReceptionIncompleteError
  ) {
    return { success: false, error: err.message };
  }
  return { success: false, error: fallback };
}

export async function updateReceptionInfoAction(
  workOrderId: string,
  preExistingDamagesDescription: string,
): Promise<ReceptionActionResult> {
  try {
    const userId = await requireUserId();
    await updateWorkOrderReceptionInfoService(userId, workOrderId, { preExistingDamagesDescription });
    revalidatePath(`/dashboard/os/${workOrderId}`);
    revalidatePath(`/dashboard/os/${workOrderId}/termo-recepcao`);
    return { success: true };
  } catch (err) {
    return friendlyError(err, "Não foi possível salvar as avarias.");
  }
}

/** Corrige queixa e KM (livre até o aceite do Termo). */
export async function updateCheckInAction(
  workOrderId: string,
  input: { customerComplaint: string; mileageAtEntry: string },
): Promise<ReceptionActionResult> {
  try {
    const userId = await requireUserId();
    await updateWorkOrderCheckInSettingsService(userId, workOrderId, input);
    revalidatePath(`/dashboard/os/${workOrderId}`);
    revalidatePath(`/dashboard/os/${workOrderId}/termo-recepcao`);
    revalidatePath(`/dashboard/os/${workOrderId}/detalhes`);
    return { success: true };
  } catch (err) {
    return friendlyError(err, "Não foi possível salvar a queixa e o KM.");
  }
}

export async function registerReceptionAcceptanceAction(
  workOrderId: string,
  input: {
    receptionAcceptedName: string;
    receptionAcceptedDocument?: string;
    receptionAwareness1: boolean;
    receptionAwareness2: boolean;
    receptionAwareness3: boolean;
  },
): Promise<ReceptionActionResult> {
  try {
    const userId = await requireUserId();
    await registerWorkOrderReceptionAcceptanceService(userId, workOrderId, input);
    revalidatePath(`/dashboard/os/${workOrderId}`);
    revalidatePath(`/dashboard/os/${workOrderId}/termo-recepcao`);
    return { success: true };
  } catch (err) {
    return friendlyError(err, "Não foi possível registrar o aceite.");
  }
}
