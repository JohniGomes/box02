import { withTransaction } from "@/lib/db/transaction";
import {
  completeWorkOrderChecklist,
  createWorkOrderChecklist,
  findWorkOrderChecklist,
  findWorkOrderChecklistById,
  findWorkOrderChecklistItemById,
  listWorkOrderChecklistItems,
  listWorkOrderChecklistsByWorkOrder,
  setWorkOrderChecklistItemChecked,
  type WorkOrderChecklistItemRecord,
  type WorkOrderChecklistRecord,
  type WorkOrderChecklistType,
} from "@/lib/db/repositories/workOrderChecklists";
import { findWorkOrderById } from "@/lib/db/repositories/workOrders";
import { findWorkOrderItemById } from "@/lib/db/repositories/workOrderItems";
import { findActiveChecklistByType, findChecklistById, listChecklistItems } from "@/lib/db/repositories/checklists";
import { findServiceById } from "@/lib/db/repositories/services";
import { recordAuditLog } from "@/lib/db/repositories/auditLog";
import {
  NoChecklistTemplateAvailableError,
  WorkOrderChecklistItemNotFoundError,
  WorkOrderChecklistNotFoundError,
  WorkOrderItemNotFoundError,
  WorkOrderNotFoundError,
} from "./errors";

export interface WorkOrderChecklistWithItems {
  checklist: WorkOrderChecklistRecord;
  items: WorkOrderChecklistItemRecord[];
}

/**
 * Inicia (ou retorna a já existente — idempotente) a instância de
 * checklist para uma OS. ENTRADA/ENTREGA: usa o checklist ATIVO desse
 * tipo, cadastrado em Configurações. EXECUCAO: usa o
 * `executionChecklistId` do serviço vinculado ao item informado.
 *
 * Copia código/nome/itens (descrição + obrigatório) UMA ÚNICA VEZ, no
 * momento desta chamada — nunca mais relê `checklists`/`checklist_items`
 * depois disso, mesmo que o molde seja editado ou inativado no futuro.
 */
export async function startWorkOrderChecklistService(
  actorUserId: string,
  workOrderId: string,
  type: WorkOrderChecklistType,
  workOrderItemId?: string,
): Promise<WorkOrderChecklistWithItems> {
  const workOrder = await findWorkOrderById(workOrderId);
  if (!workOrder) throw new WorkOrderNotFoundError(workOrderId);

  if (type === "EXECUCAO") {
    if (!workOrderItemId) throw new WorkOrderItemNotFoundError("");
    const item = await findWorkOrderItemById(workOrderItemId);
    if (!item || item.workOrderId !== workOrderId) throw new WorkOrderItemNotFoundError(workOrderItemId);
  }

  return withTransaction(async (client) => {
    // Idempotente: se já existe, retorna sem recriar.
    const existing = await findWorkOrderChecklist(
      { workOrderId, type, workOrderItemId: type === "EXECUCAO" ? workOrderItemId : null },
      client,
    );
    if (existing) {
      const items = await listWorkOrderChecklistItems(existing.id, client);
      return { checklist: existing, items };
    }

    // Localiza o molde correto conforme o tipo.
    let sourceChecklist;
    if (type === "EXECUCAO") {
      const item = await findWorkOrderItemById(workOrderItemId!, client);
      if (!item?.serviceId) throw new NoChecklistTemplateAvailableError(type);
      const service = await findServiceById(item.serviceId);
      if (!service?.executionChecklistId) throw new NoChecklistTemplateAvailableError(type);
      sourceChecklist = await findChecklistById(service.executionChecklistId, client);
      if (!sourceChecklist || sourceChecklist.status !== "ATIVO") throw new NoChecklistTemplateAvailableError(type);
    } else {
      sourceChecklist = await findActiveChecklistByType(type, client);
      if (!sourceChecklist) throw new NoChecklistTemplateAvailableError(type);
    }

    const templateItems = await listChecklistItems(sourceChecklist.id, client);

    const created = await createWorkOrderChecklist(
      {
        workOrderId,
        workOrderItemId: type === "EXECUCAO" ? workOrderItemId : null,
        sourceChecklistId: sourceChecklist.id,
        code: sourceChecklist.code,
        name: sourceChecklist.name,
        type,
        items: templateItems.map((i) => ({ description: i.description, required: i.required, sortOrder: i.sortOrder })),
      },
      client,
    );

    await recordAuditLog({
      userId: actorUserId,
      action: "WORK_ORDER_CHECKLIST_STARTED",
      entityType: "work_order",
      entityId: workOrderId,
      metadata: { checklistId: created.checklist.id, type, sourceCode: sourceChecklist.code },
    });

    return created;
  });
}

export async function checkWorkOrderChecklistItemService(
  actorUserId: string,
  workOrderChecklistId: string,
  itemId: string,
  checked: boolean,
): Promise<WorkOrderChecklistItemRecord> {
  const item = await findWorkOrderChecklistItemById(itemId);
  if (!item || item.workOrderChecklistId !== workOrderChecklistId) throw new WorkOrderChecklistItemNotFoundError();

  const updated = await setWorkOrderChecklistItemChecked(itemId, checked, checked ? actorUserId : null);
  if (!updated) throw new WorkOrderChecklistItemNotFoundError();

  await recordAuditLog({
    userId: actorUserId,
    action: checked ? "WORK_ORDER_CHECKLIST_ITEM_CHECKED" : "WORK_ORDER_CHECKLIST_ITEM_UNCHECKED",
    entityType: "work_order_checklist",
    entityId: workOrderChecklistId,
    metadata: { itemId },
  });

  return updated;
}

export async function completeWorkOrderChecklistService(
  actorUserId: string,
  workOrderChecklistId: string,
): Promise<WorkOrderChecklistRecord> {
  const checklist = await findWorkOrderChecklistById(workOrderChecklistId);
  if (!checklist) throw new WorkOrderChecklistNotFoundError();

  const updated = await completeWorkOrderChecklist(workOrderChecklistId, actorUserId);
  if (!updated) throw new WorkOrderChecklistNotFoundError();

  await recordAuditLog({
    userId: actorUserId,
    action: "WORK_ORDER_CHECKLIST_COMPLETED",
    entityType: "work_order",
    entityId: checklist.workOrderId,
    metadata: { checklistId: workOrderChecklistId },
  });

  return updated;
}

export async function getWorkOrderChecklistsService(workOrderId: string): Promise<WorkOrderChecklistWithItems[]> {
  const checklists = await listWorkOrderChecklistsByWorkOrder(workOrderId);
  const result: WorkOrderChecklistWithItems[] = [];
  for (const checklist of checklists) {
    const items = await listWorkOrderChecklistItems(checklist.id);
    result.push({ checklist, items });
  }
  return result;
}
