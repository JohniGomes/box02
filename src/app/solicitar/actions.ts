"use server";

import { ZodError } from "zod";
import { createServiceRequestService } from "@/lib/serviceRequests/service";

export interface SubmitServiceRequestResult {
  success: boolean;
  error?: string;
  customerName?: string;
  customerPhone?: string;
  vehicleDescription?: string;
  vehiclePlate?: string;
  preferredTime?: string;
  description?: string;
}

/**
 * Ação pública — deliberadamente SEM `auth()`. É o próprio cliente, sem
 * login, preenchendo o formulário em /solicitar.
 */
export async function submitServiceRequestAction(input: {
  customerName: string;
  customerPhone: string;
  vehicleDescription?: string;
  vehiclePlate?: string;
  preferredTime?: string;
  description: string;
}): Promise<SubmitServiceRequestResult> {
  try {
    const request = await createServiceRequestService(input);
    return {
      success: true,
      customerName: request.customerName,
      customerPhone: request.customerPhone,
      vehicleDescription: request.vehicleDescription ?? undefined,
      vehiclePlate: request.vehiclePlate ?? undefined,
      preferredTime: request.preferredTime ?? undefined,
      description: request.description,
    };
  } catch (err) {
    if (err instanceof ZodError) {
      const firstIssue = err.issues[0];
      return { success: false, error: firstIssue?.message ?? "Dados inválidos. Confira e tente novamente." };
    }
    return { success: false, error: "Não foi possível enviar sua solicitação. Tente novamente." };
  }
}
