"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/auth";
import {
  refundWorkOrderPaymentService,
  registerWorkOrderPaymentService,
  registerWorkOrderPaymentsService,
} from "@/lib/workOrders/service";
import {
  WorkOrderNotDeliveredError,
  WorkOrderNotFoundError,
  WorkOrderPaymentDateError,
  WorkOrderPaymentExceedsBalanceError,
  WorkOrderPaymentNotFoundError,
  WorkOrderPaymentRefundExceedsAmountError,
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
  input: { amountReais: string; method: string; notes?: string; receivedOn?: string },
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
      err instanceof WorkOrderPaymentExceedsBalanceError ||
      err instanceof WorkOrderPaymentDateError
    ) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "Não foi possível registrar o recebimento." };
  }
}

export async function registerWorkOrderPaymentsAction(
  workOrderId: string,
  input: { payments: { amountReais: string; method: string }[]; notes?: string; receivedOn?: string },
): Promise<PaymentActionResult> {
  try {
    const userId = await requireUserId();
    await registerWorkOrderPaymentsService(userId, workOrderId, input);
    revalidatePath(`/dashboard/os/${workOrderId}`);
    revalidatePath("/dashboard");
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
      err instanceof WorkOrderPaymentExceedsBalanceError ||
      err instanceof WorkOrderPaymentDateError
    ) {
      return { success: false, error: err.message };
    }
    if (err instanceof Error && err.message.startsWith("O valor do recebimento")) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "Não foi possível registrar o recebimento." };
  }
}

// ============================================================
// Ciclo M — Estorno de recebimento (DEC-I6 revisitada)
// ============================================================

export async function refundWorkOrderPaymentAction(
  workOrderId: string,
  paymentId: string,
  input: { refundReais: string; reason: string },
): Promise<PaymentActionResult> {
  try {
    const userId = await requireUserId();
    await refundWorkOrderPaymentService(userId, workOrderId, paymentId, input);
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
      err instanceof WorkOrderPaymentNotFoundError ||
      err instanceof WorkOrderPaymentRefundExceedsAmountError
    ) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "Não foi possível registrar o estorno." };
  }
}
