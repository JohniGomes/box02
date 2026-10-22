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
  openWorkOrderReturnService,
  reactivateWorkOrderService,
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
  WorkOrderReturnNotDeliveredError,
  WorkOrderNotCancelledError,
  WorkOrderHasPendingItemsError,
} from "@/lib/workOrders/errors";
import { VehicleNotOwnedByCustomerError } from "@/lib/quotes/errors";
import { VehicleCustomerNotFoundError } from "@/lib/vehicles/errors";
import { InsufficientStockError, PartNotActiveError, PartNotFoundError } from "@/lib/inventory/errors";
import type { WorkOrderStatus } from "@/lib/db/repositories/workOrders";
import { parseExecutorValue } from "@/lib/executors/value";
import {
  executeItemWithStockEntryService,
  getItemStockEntryDefaultsService,
  type StockEntryDefaults,
} from "@/lib/workOrders/stockEntry";

export interface ActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  workOrderId?: string;
  /** Preenchido quando a execução parou por falta de estoque da peça: a tela
   * oferece "dar entrada e executar" em vez de só mostrar o erro. */
  stockShortage?: { available: number; needed: number };
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
  if (err instanceof InsufficientStockError) {
    return {
      success: false,
      error: err.message,
      stockShortage: { available: err.available, needed: err.requested },
    };
  }
  if (
    err instanceof QuoteNotApprovedError ||
    err instanceof WorkOrderReturnNotDeliveredError ||
    err instanceof WorkOrderNotCancelledError ||
    err instanceof InvalidWorkOrderTransitionError ||
    err instanceof InvalidWorkOrderItemTransitionError ||
    err instanceof WorkOrderHasPendingItemsError ||
    err instanceof VehicleNotOwnedByCustomerError ||
    err instanceof VehicleCustomerNotFoundError ||
    err instanceof AdditionalItemNotAuthorizedError ||
    err instanceof AdditionalItemAlreadyDecidedError ||
    err instanceof AdditionalItemNotEligibleError ||
    err instanceof InvalidExecutorUserError ||
    err instanceof InsufficientStockError ||
    err instanceof PartNotActiveError ||
    err instanceof PartNotFoundError
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

export async function openWorkOrderReturnAction(originalWorkOrderId: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const { workOrder } = await openWorkOrderReturnService(userId, originalWorkOrderId);
    revalidatePath("/dashboard/os");
    revalidatePath(`/dashboard/os/${originalWorkOrderId}`);
    return { success: true, workOrderId: workOrder.id };
  } catch (err) {
    return friendlyError(err, "Não foi possível abrir o retorno.");
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
  /** `executedBy` = valor escolhido no seletor (executor da lista ou usuário). */
  extra?: { cancelReason?: string; executedBy?: string },
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const rawInput =
      status === "CANCELADO"
        ? { reason: extra?.cancelReason }
        : extra?.executedBy
          ? parseExecutorValue(extra.executedBy)
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
  executedBy: string,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await correctWorkOrderItemExecutorService(userId, workOrderId, itemId, parseExecutorValue(executedBy));
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

export async function reactivateWorkOrderAction(workOrderId: string, reason: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await reactivateWorkOrderService(userId, workOrderId, { reason });
    revalidatePath(`/dashboard/os/${workOrderId}`);
    revalidatePath("/dashboard/os");
    revalidatePath("/dashboard");
    return { success: true, workOrderId };
  } catch (err) {
    return friendlyError(err, "Não foi possível reativar a OS.");
  }
}

/** Dados do aviso de falta de estoque (nome da peça, quanto falta, custo atual). */
export async function getItemStockEntryDefaultsAction(
  workOrderId: string,
  itemId: string,
): Promise<{ success: boolean; error?: string; defaults?: StockEntryDefaults }> {
  try {
    await requireUserId();
    const defaults = await getItemStockEntryDefaultsService(workOrderId, itemId);
    return { success: true, defaults };
  } catch (err) {
    return { success: false, error: friendlyError(err, "Não foi possível consultar o estoque.").error };
  }
}

/** Dá a entrada da peça que chegou e executa o item (a baixa fecha o saldo). */
export async function executeItemWithStockEntryAction(
  workOrderId: string,
  itemId: string,
  input: { executedBy: string; entryQuantity: string; unitCostReais?: string; payment?: unknown },
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await executeItemWithStockEntryService(userId, workOrderId, itemId, input);
    revalidatePath(`/dashboard/os/${workOrderId}`);
    revalidatePath("/dashboard/estoque");
    return { success: true, workOrderId };
  } catch (err) {
    return friendlyError(err, "Não foi possível dar entrada e executar o item.");
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
