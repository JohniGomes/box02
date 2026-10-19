"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { setServiceRequestStatusService } from "@/lib/serviceRequests/service";
import { ServiceRequestNotFoundError } from "@/lib/serviceRequests/errors";

export interface ServiceRequestActionResult {
  success: boolean;
  error?: string;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado.");
  return session.user.id;
}

export async function markServiceRequestAttendedAction(
  serviceRequestId: string,
): Promise<ServiceRequestActionResult> {
  try {
    const userId = await requireUserId();
    await setServiceRequestStatusService(userId, serviceRequestId, "ATENDIDA");
    revalidatePath("/dashboard/solicitacoes");
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceRequestNotFoundError) return { success: false, error: err.message };
    return { success: false, error: "Não foi possível marcar como atendida." };
  }
}

export async function discardServiceRequestAction(
  serviceRequestId: string,
): Promise<ServiceRequestActionResult> {
  try {
    const userId = await requireUserId();
    await setServiceRequestStatusService(userId, serviceRequestId, "DESCARTADA");
    revalidatePath("/dashboard/solicitacoes");
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceRequestNotFoundError) return { success: false, error: err.message };
    return { success: false, error: "Não foi possível descartar." };
  }
}
