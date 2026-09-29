import {
  createChecklist,
  createChecklistItem,
  deleteChecklistItem,
  findActiveChecklistByType,
  findChecklistByCode,
  findChecklistById,
  findChecklistItemById,
  listChecklistItems,
  searchChecklists,
  setChecklistStatus,
  updateChecklist,
  updateChecklistItem,
  type ChecklistItemRecord,
  type ChecklistRecord,
  type ChecklistType,
  type SearchChecklistsFilters,
} from "@/lib/db/repositories/checklists";
import { recordAuditLog } from "@/lib/db/repositories/auditLog";
import {
  checklistInputSchema,
  checklistItemInputSchema,
  type ChecklistInput,
  type ChecklistItemInput,
} from "@/lib/validation/checklist";
import {
  ActiveChecklistOfTypeAlreadyExistsError,
  ChecklistCodeAlreadyExistsError,
  ChecklistItemNotFoundError,
  ChecklistNotFoundError,
} from "./errors";

async function assertCodeAvailable(code: string, ignoreId?: string): Promise<void> {
  const existing = await findChecklistByCode(code);
  if (existing && existing.id !== ignoreId) {
    throw new ChecklistCodeAlreadyExistsError(code);
  }
}

/** ENTRADA/ENTREGA: no máximo um ATIVO por vez — checagem central usada
 * tanto na criação (todo checklist nasce ATIVO) quanto na reativação.
 * EXECUCAO nunca cai aqui — não tem exclusividade. */
async function assertNoOtherActiveOfType(type: ChecklistType, ignoreId?: string): Promise<void> {
  if (type === "EXECUCAO") return;
  const existing = await findActiveChecklistByType(type);
  if (existing && existing.id !== ignoreId) {
    throw new ActiveChecklistOfTypeAlreadyExistsError(type, existing.code);
  }
}

export async function createChecklistService(actorUserId: string, rawInput: unknown): Promise<ChecklistRecord> {
  const input = checklistInputSchema.parse(rawInput) as ChecklistInput;
  await assertCodeAvailable(input.code);
  await assertNoOtherActiveOfType(input.type);

  const checklist = await createChecklist({ code: input.code, name: input.name, type: input.type });

  await recordAuditLog({
    userId: actorUserId,
    action: "CHECKLIST_CREATED",
    entityType: "checklist",
    entityId: checklist.id,
    metadata: { code: checklist.code, type: checklist.type },
  });

  return checklist;
}

export async function updateChecklistService(
  actorUserId: string,
  checklistId: string,
  rawInput: { code: string; name: string },
): Promise<ChecklistRecord> {
  const existing = await findChecklistById(checklistId);
  if (!existing) throw new ChecklistNotFoundError();
  await assertCodeAvailable(rawInput.code, checklistId);

  const updated = await updateChecklist(checklistId, { code: rawInput.code, name: rawInput.name });
  if (!updated) throw new ChecklistNotFoundError();

  await recordAuditLog({
    userId: actorUserId,
    action: "CHECKLIST_UPDATED",
    entityType: "checklist",
    entityId: checklistId,
    metadata: { code: updated.code },
  });

  return updated;
}

export async function inactivateChecklistService(actorUserId: string, checklistId: string): Promise<ChecklistRecord> {
  const updated = await setChecklistStatus(checklistId, "INATIVO");
  if (!updated) throw new ChecklistNotFoundError();

  await recordAuditLog({
    userId: actorUserId,
    action: "CHECKLIST_INACTIVATED",
    entityType: "checklist",
    entityId: checklistId,
  });

  return updated;
}

/** Reativar ENTRADA/ENTREGA só é permitido se não houver outro ATIVO do
 * mesmo tipo — nunca desativa o outro implicitamente. */
export async function reactivateChecklistService(actorUserId: string, checklistId: string): Promise<ChecklistRecord> {
  const existing = await findChecklistById(checklistId);
  if (!existing) throw new ChecklistNotFoundError();
  await assertNoOtherActiveOfType(existing.type, checklistId);

  const updated = await setChecklistStatus(checklistId, "ATIVO");
  if (!updated) throw new ChecklistNotFoundError();

  await recordAuditLog({
    userId: actorUserId,
    action: "CHECKLIST_REACTIVATED",
    entityType: "checklist",
    entityId: checklistId,
  });

  return updated;
}

export async function getChecklistService(
  checklistId: string,
): Promise<{ checklist: ChecklistRecord; items: ChecklistItemRecord[] } | null> {
  const checklist = await findChecklistById(checklistId);
  if (!checklist) return null;
  const items = await listChecklistItems(checklistId);
  return { checklist, items };
}

export async function searchChecklistsService(filters: SearchChecklistsFilters) {
  return searchChecklists(filters);
}

// ---- Itens ----

export async function addChecklistItemService(
  actorUserId: string,
  checklistId: string,
  rawInput: unknown,
): Promise<ChecklistItemRecord> {
  const checklist = await findChecklistById(checklistId);
  if (!checklist) throw new ChecklistNotFoundError();

  const input = checklistItemInputSchema.parse(rawInput) as ChecklistItemInput;
  const item = await createChecklistItem({
    checklistId,
    description: input.description,
    required: input.required,
    sortOrder: input.sortOrder,
  });

  await recordAuditLog({
    userId: actorUserId,
    action: "CHECKLIST_ITEM_ADDED",
    entityType: "checklist",
    entityId: checklistId,
    metadata: { itemId: item.id, description: item.description },
  });

  return item;
}

export async function updateChecklistItemService(
  actorUserId: string,
  checklistId: string,
  itemId: string,
  rawInput: unknown,
): Promise<ChecklistItemRecord> {
  const item = await findChecklistItemById(itemId);
  if (!item || item.checklistId !== checklistId) throw new ChecklistItemNotFoundError();

  const input = checklistItemInputSchema.parse(rawInput) as ChecklistItemInput;
  const updated = await updateChecklistItem(itemId, {
    description: input.description,
    required: input.required,
    sortOrder: input.sortOrder,
  });
  if (!updated) throw new ChecklistItemNotFoundError();

  await recordAuditLog({
    userId: actorUserId,
    action: "CHECKLIST_ITEM_UPDATED",
    entityType: "checklist",
    entityId: checklistId,
    metadata: { itemId },
  });

  return updated;
}

/** Remove um item do MOLDE. Seguro mesmo depois do Ciclo E existir: a
 * cópia congelada numa OS já usada nunca relê o molde, então remover um
 * item aqui nunca afeta um checklist já executado no passado. */
export async function removeChecklistItemService(
  actorUserId: string,
  checklistId: string,
  itemId: string,
): Promise<void> {
  const item = await findChecklistItemById(itemId);
  if (!item || item.checklistId !== checklistId) throw new ChecklistItemNotFoundError();

  await deleteChecklistItem(itemId);

  await recordAuditLog({
    userId: actorUserId,
    action: "CHECKLIST_ITEM_REMOVED",
    entityType: "checklist",
    entityId: checklistId,
    metadata: { itemId, description: item.description },
  });
}
