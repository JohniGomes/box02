"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/auth";
import { registerWorkOrderPaymentService } from "@/lib/workOrders/service";
import {
  WorkOrderNotDeliveredError,
  WorkOrderNotFoundError,
  WorkOrderPaymentExceedsBalanceError,
} from "@/lib/workOrders/errors";

export interface PaymentActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado.");
  return session.user.id;
}

export async function registerWorkOrderPaymentAction(
  workOrderId: string,
  input: { amountReais: string; method: string; notes?: string },
): Promise<PaymentActionResult> {
  try {
    const userId = await requireUserId();
    await registerWorkOrderPaymentService(userId, workOrderId, input);
    revalidatePath(`/dashboard/os/${workOrderId}`);
    return { success: true };
  } catch (err) {
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
      err instanceof WorkOrderNotDeliveredError ||
      err instanceof WorkOrderPaymentExceedsBalanceError
    ) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "Não foi possível registrar o recebimento." };
  }
}
