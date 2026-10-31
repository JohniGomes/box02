"use server";

import { linkAppointmentToWorkOrderService } from "@/lib/appointments/service";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/auth";
import {
  cancelWorkOrderService,
  closeWorkOrderService,
  correctWorkOrderItemExecutorService,
  correctWorkOrderItemService,
  correctWorkOrderItemCostService,
  createAdditionalItemService,
  createWorkOrderFromQuoteService,
  createWorkOrderWithoutQuoteService,
  openWorkOrderReturnService,
  correctWorkOrderServiceDateService,
  reopenWorkOrderService,
  WorkOrderCorrectionError,
  reactivateWorkOrderService,
  authorizeAdditionalItemDirectlyService,
  adjustAdditionalItemService,
  correctApprovedAdditionalItemService,
  undoWorkOrderItemExecutionService,
  generateAdditionalItemLinkService,
  getWorkOrderService,
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
  WorkOrderNotDeliveredForCorrectionError,
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
    err instanceof WorkOrderNotDeliveredForCorrectionError ||
    err instanceof WorkOrderCorrectionError ||
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

export async function createWorkOrderWithoutQuoteAction(input: unknown, appointmentId?: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const { workOrder } = await createWorkOrderWithoutQuoteService(userId, input);
    if (appointmentId) {
      // O vínculo nunca impede de abrir a OS: se falhar, a OS já existe.
      try {
        await linkAppointmentToWorkOrderService(appointmentId, workOrder.id);
        revalidatePath("/dashboard/agendamentos");
        revalidatePath("/dashboard");
      } catch {
        /* segue sem o vínculo */
      }
    }
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

/** Corrige a descrição e/ou o valor de um item da OS (fica registrado quem mudou e o que era). */
export async function correctWorkOrderItemAction(
  workOrderId: string,
  itemId: string,
  input: { description?: string; unitPriceReais?: string; reason?: string },
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await correctWorkOrderItemService(userId, workOrderId, itemId, input);
    revalidatePath(`/dashboard/os/${workOrderId}`);
    revalidatePath(`/dashboard/os/${workOrderId}/detalhes`);
    return { success: true, workOrderId };
  } catch (err) {
    return friendlyError(err, "Não foi possível corrigir o item.");
  }
}

/** Corrige o custo gravado num item já executado (uso interno; muda só a margem). */
export async function correctWorkOrderItemCostAction(
  workOrderId: string,
  itemId: string,
  input: { unitCostReais?: string; reason?: string },
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await correctWorkOrderItemCostService(userId, workOrderId, itemId, input);
    revalidatePath(`/dashboard/os/${workOrderId}`);
    revalidatePath(`/dashboard/os/${workOrderId}/detalhes`);
    revalidatePath("/dashboard/financeiro");
    return { success: true, workOrderId };
  } catch (err) {
    return friendlyError(err, "Não foi possível corrigir o custo.");
  }
}

/**
 * Atalho ao entregar: marca todos os itens ainda "planejados" como executados. Cada item segue o mesmo
 * caminho do botão do item (inclusive a baixa de estoque); o que não puder (falta de peça etc.) fica
 * de fora e a mensagem diz quais, sem desfazer os que deram certo.
 */
export async function markAllPlannedExecutedAction(
  workOrderId: string,
  executedBy: string,
): Promise<ActionResult & { done?: number }> {
  try {
    const userId = await requireUserId();
    const data = await getWorkOrderService(workOrderId);
    if (!data) return { success: false, error: "OS não encontrada." };
    const planned = data.items.filter((i) => i.status === "PLANEJADO");
    const rawInput = executedBy ? parseExecutorValue(executedBy) : undefined;
    let done = 0;
    const failed: string[] = [];
    for (const item of planned) {
      try {
        await setWorkOrderItemStatusService(userId, workOrderId, item.id, "EXECUTADO", rawInput);
        done += 1;
      } catch (err) {
        failed.push(err instanceof InsufficientStockError ? `${item.description} (falta peça no estoque)` : item.description);
      }
    }
    revalidatePath(`/dashboard/os/${workOrderId}`);
    if (failed.length > 0) {
      return {
        success: false,
        done,
        workOrderId,
        error: `${done} item(ns) marcado(s). Não deu para marcar: ${failed.join("; ")}. Resolva esses pelo botão do próprio item.`,
      };
    }
    return { success: true, done, workOrderId };
  } catch (err) {
    return friendlyError(err, "Não foi possível marcar os itens.");
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

export async function cancelWorkOrderAction(workOrderId: string, reason: string, returnParts?: boolean): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await cancelWorkOrderService(userId, workOrderId, { reason, returnParts });
    if (returnParts) revalidatePath("/dashboard/estoque");
    revalidatePath(`/dashboard/os/${workOrderId}`);
    return { success: true, workOrderId };
  } catch (err) {
    return friendlyError(err, "Não foi possível cancelar a OS.");
  }
}

/** Corrige a data de atendimento de uma OS entregue (com motivo; fica no histórico). */
export async function correctServiceDateAction(
  workOrderId: string,
  input: { serviceDate: string; serviceTime?: string; reason: string },
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await correctWorkOrderServiceDateService(userId, workOrderId, input);
    revalidatePath(`/dashboard/os/${workOrderId}`);
    revalidatePath("/dashboard/os");
    revalidatePath("/dashboard");
    return { success: true, workOrderId };
  } catch (err) {
    return friendlyError(err, "Não foi possível corrigir a data de atendimento.");
  }
}

/** Reabre uma OS entregue (volta para Pronta), com motivo. Não apaga pagamentos nem estoque. */
export async function reopenWorkOrderAction(workOrderId: string, reason: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await reopenWorkOrderService(userId, workOrderId, { reason });
    revalidatePath(`/dashboard/os/${workOrderId}`);
    revalidatePath("/dashboard/os");
    revalidatePath("/dashboard");
    return { success: true, workOrderId };
  } catch (err) {
    return friendlyError(err, "Não foi possível reabrir a OS.");
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

export async function undoWorkOrderItemExecutionAction(
  workOrderId: string,
  itemId: string,
  reason: string,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await undoWorkOrderItemExecutionService(userId, workOrderId, itemId, { reason });
    revalidatePath(`/dashboard/os/${workOrderId}`);
    revalidatePath("/dashboard/estoque");
    return { success: true, workOrderId };
  } catch (err) {
    return friendlyError(err, "Não foi possível desfazer a execução.");
  }
}

export async function correctApprovedAdditionalItemAction(
  workOrderId: string,
  itemId: string,
  input: unknown,
): Promise<AdditionalItemActionResult> {
  try {
    const userId = await requireUserId();
    const newItem = await correctApprovedAdditionalItemService(userId, workOrderId, itemId, input);
    revalidatePath(`/dashboard/os/${workOrderId}`);
    return { success: true, workOrderId, itemId: newItem.id };
  } catch (err) {
    return friendlyError(err, "Não foi possível corrigir o adicional.");
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
