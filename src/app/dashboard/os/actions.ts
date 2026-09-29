"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/auth";
import {
  cancelWorkOrderService,
  closeWorkOrderService,
  correctWorkOrderItemExecutorService,
  createAdditionalItemService,
  createWorkOrderFromQuoteService,
  createWorkOrderWithoutQuoteService,
  authorizeAdditionalItemDirectlyService,
  adjustAdditionalItemService,
  generateAdditionalItemLinkService,
  setWorkOrderItemStatusService,
  setWorkOrderStatusService,
} from "@/lib/workOrders/service";
import {
  AdditionalItemAlreadyDecidedError,
  AdditionalItemNotAuthorizedError,
  AdditionalItemNotEligibleError,
  InvalidExecutorUserError,
  InvalidWorkOrderItemTransitionError,
  InvalidWorkOrderTransitionError,
  QuoteNotApprovedError,
  WorkOrderHasPendingItemsError,
} from "@/lib/workOrders/errors";
import { VehicleNotOwnedByCustomerError } from "@/lib/quotes/errors";
import { VehicleCustomerNotFoundError } from "@/lib/vehicles/errors";
import type { WorkOrderStatus } from "@/lib/db/repositories/workOrders";

export interface ActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  workOrderId?: string;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado.");
  return session.user.id;
}

function toFieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_root";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

function friendlyError(err: unknown, fallback: string): ActionResult {
  if (err instanceof ZodError) {
    return { success: false, error: "Existem campos inválidos.", fieldErrors: toFieldErrors(err) };
  }
  if (
    err instanceof QuoteNotApprovedError ||
    err instanceof InvalidWorkOrderTransitionError ||
    err instanceof InvalidWorkOrderItemTransitionError ||
    err instanceof WorkOrderHasPendingItemsError ||
    err instanceof VehicleNotOwnedByCustomerError ||
    err instanceof VehicleCustomerNotFoundError ||
    err instanceof AdditionalItemNotAuthorizedError ||
    err instanceof AdditionalItemAlreadyDecidedError ||
    err instanceof AdditionalItemNotEligibleError ||
    err instanceof InvalidExecutorUserError
  ) {
    return { success: false, error: err.message };
  }
  return { success: false, error: fallback };
}

export async function createWorkOrderFromQuoteAction(
  quoteId: string,
  checkIn: unknown,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const { workOrder } = await createWorkOrderFromQuoteService(userId, quoteId, checkIn);
    revalidatePath("/dashboard/os");
    revalidatePath(`/dashboard/orcamentos/${quoteId}`);
    return { success: true, workOrderId: workOrder.id };
  } catch (err) {
    return friendlyError(err, "Não foi possível criar a OS a partir do orçamento.");
  }
}

export async function createWorkOrderWithoutQuoteAction(input: unknown): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const { workOrder } = await createWorkOrderWithoutQuoteService(userId, input);
    revalidatePath("/dashboard/os");
    return { success: true, workOrderId: workOrder.id };
  } catch (err) {
    return friendlyError(err, "Não foi possível criar a OS.");
  }
}

export async function setWorkOrderStatusAction(
  workOrderId: string,
  newStatus: WorkOrderStatus,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await setWorkOrderStatusService(userId, workOrderId, newStatus);
    revalidatePath(`/dashboard/os/${workOrderId}`);
    return { success: true, workOrderId };
  } catch (err) {
    return friendlyError(err, "Não foi possível mudar o status da OS.");
  }
}

export async function setWorkOrderItemStatusAction(
  workOrderId: string,
  itemId: string,
  status: "EXECUTADO" | "CANCELADO",
  extra?: { cancelReason?: string; executedByUserId?: string },
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const rawInput =
      status === "CANCELADO"
        ? { reason: extra?.cancelReason }
        : extra?.executedByUserId
          ? { executedByUserId: extra.executedByUserId }
          : undefined;
    await setWorkOrderItemStatusService(userId, workOrderId, itemId, status, rawInput);
    revalidatePath(`/dashboard/os/${workOrderId}`);
    return { success: true, workOrderId };
  } catch (err) {
    return friendlyError(err, "Não foi possível atualizar o item.");
  }
}

// ============================================================
// Ciclo L — Rastreabilidade de Execução por Mecânico
// ============================================================

export async function correctWorkOrderItemExecutorAction(
  workOrderId: string,
  itemId: string,
  executedByUserId: string,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await correctWorkOrderItemExecutorService(userId, workOrderId, itemId, { executedByUserId });
    revalidatePath(`/dashboard/os/${workOrderId}`);
    return { success: true, workOrderId };
  } catch (err) {
    return friendlyError(err, "Não foi possível corrigir o executor.");
  }
}

export async function closeWorkOrderAction(
  workOrderId: string,
  delivery: unknown,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await closeWorkOrderService(userId, workOrderId, delivery);
    revalidatePath(`/dashboard/os/${workOrderId}`);
    return { success: true, workOrderId };
  } catch (err) {
    return friendlyError(err, "Não foi possível fechar a OS.");
  }
}

export async function cancelWorkOrderAction(workOrderId: string, reason: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await cancelWorkOrderService(userId, workOrderId, { reason });
    revalidatePath(`/dashboard/os/${workOrderId}`);
    return { success: true, workOrderId };
  } catch (err) {
    return friendlyError(err, "Não foi possível cancelar a OS.");
  }
}

// ============================================================
// Sub-etapa 2 — Adicionais durante a execução
// ============================================================

export interface AdditionalItemActionResult extends ActionResult {
  itemId?: string;
  token?: string;
}

export async function createAdditionalItemAction(
  workOrderId: string,
  input: unknown,
): Promise<AdditionalItemActionResult> {
  try {
    const userId = await requireUserId();
    const item = await createAdditionalItemService(userId, workOrderId, input);
    revalidatePath(`/dashboard/os/${workOrderId}`);
    return { success: true, workOrderId, itemId: item.id };
  } catch (err) {
    return friendlyError(err, "Não foi possível registrar o adicional.");
  }
}

export async function generateAdditionalItemLinkAction(
  workOrderId: string,
  itemId: string,
): Promise<AdditionalItemActionResult> {
  try {
    const userId = await requireUserId();
    const { token } = await generateAdditionalItemLinkService(userId, workOrderId, itemId);
    revalidatePath(`/dashboard/os/${workOrderId}`);
    return { success: true, workOrderId, itemId, token };
  } catch (err) {
    return friendlyError(err, "Não foi possível gerar o link.");
  }
}

export async function authorizeAdditionalItemDirectlyAction(
  workOrderId: string,
  itemId: string,
  input: unknown,
): Promise<AdditionalItemActionResult> {
  try {
    const userId = await requireUserId();
    await authorizeAdditionalItemDirectlyService(userId, workOrderId, itemId, input);
    revalidatePath(`/dashboard/os/${workOrderId}`);
    return { success: true, workOrderId, itemId };
  } catch (err) {
    return friendlyError(err, "Não foi possível registrar a autorização.");
  }
}

export async function adjustAdditionalItemAction(
  workOrderId: string,
  itemId: string,
  input: unknown,
): Promise<AdditionalItemActionResult> {
  try {
    const userId = await requireUserId();
    const newItem = await adjustAdditionalItemService(userId, workOrderId, itemId, input);
    revalidatePath(`/dashboard/os/${workOrderId}`);
    return { success: true, workOrderId, itemId: newItem.id };
  } catch (err) {
    return friendlyError(err, "Não foi possível ajustar o item.");
  }
}
