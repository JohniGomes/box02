import type { Pool, PoolClient } from "pg";
import { pool } from "../pool";
import { createId } from "@paralleldrive/cuid2";

type Queryable = Pool | PoolClient;

export type WorkOrderChecklistType = "ENTRADA" | "EXECUCAO" | "ENTREGA";

export interface WorkOrderChecklistRecord {
  id: string;
  workOrderId: string;
  workOrderItemId: string | null;
  sourceChecklistId: string | null;
  code: string;
  name: string;
  type: WorkOrderChecklistType;
  startedAt: Date;
  completedAt: Date | null;
  completedByUserId: string | null;
}

export interface WorkOrderChecklistItemRecord {
  id: string;
  workOrderChecklistId: string;
  description: string;
  required: boolean;
  sortOrder: number;
  checked: boolean;
  checkedAt: Date | null;
  checkedByUserId: string | null;
}

const CHECKLIST_COLUMNS = `
  id, "workOrderId", "workOrderItemId", "sourceChecklistId", code, name, type,
  "startedAt", "completedAt", "completedByUserId"
`;
const ITEM_COLUMNS = `
  id, "workOrderChecklistId", description, required, "sortOrder",
  checked, "checkedAt", "checkedByUserId"
`;

/** Busca a instância já existente para (workOrderId, type) — ENTRADA/ENTREGA
 * (workOrderItemId sempre null nesses casos) ou (workOrderItemId) para
 * EXECUCAO. Usada para o "iniciar" ser idempotente (get-or-create). */
export async function findWorkOrderChecklist(
  params: { workOrderId: string; type: WorkOrderChecklistType; workOrderItemId?: string | null },
  db: Queryable = pool,
): Promise<WorkOrderChecklistRecord | null> {
  const result = await db.query<WorkOrderChecklistRecord>(
    `SELECT ${CHECKLIST_COLUMNS} FROM work_order_checklists
     WHERE "workOrderId" = $1 AND type = $2
       AND "workOrderItemId" IS NOT DISTINCT FROM $3
     LIMIT 1`,
    [params.workOrderId, params.type, params.workOrderItemId ?? null],
  );
  return result.rows[0] ?? null;
}

export async function findWorkOrderChecklistById(id: string, db: Queryable = pool): Promise<WorkOrderChecklistRecord | null> {
  const result = await db.query<WorkOrderChecklistRecord>(`SELECT ${CHECKLIST_COLUMNS} FROM work_order_checklists WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function listWorkOrderChecklistsByWorkOrder(workOrderId: string, db: Queryable = pool): Promise<WorkOrderChecklistRecord[]> {
  const result = await db.query<WorkOrderChecklistRecord>(
    `SELECT ${CHECKLIST_COLUMNS} FROM work_order_checklists WHERE "workOrderId" = $1 ORDER BY "startedAt" ASC`,
    [workOrderId],
  );
  return result.rows;
}

export interface CreateWorkOrderChecklistInput {
  workOrderId: string;
  workOrderItemId?: string | null;
  sourceChecklistId: string;
  code: string;
  name: string;
  type: WorkOrderChecklistType;
  items: { description: string; required: boolean; sortOrder: number }[];
}

/** Cria a instância + todos os itens copiados, numa única chamada — quem
 * chama é responsável por já ter confirmado (via findWorkOrderChecklist)
 * que não existe uma instância anterior, dentro da mesma transação. */
export async function createWorkOrderChecklist(
  input: CreateWorkOrderChecklistInput,
  db: Queryable = pool,
): Promise<{ checklist: WorkOrderChecklistRecord; items: WorkOrderChecklistItemRecord[] }> {
  const id = createId();
  const checklistResult = await db.query<WorkOrderChecklistRecord>(
    `INSERT INTO work_order_checklists (id, "workOrderId", "workOrderItemId", "sourceChecklistId", code, name, type)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${CHECKLIST_COLUMNS}`,
    [id, input.workOrderId, input.workOrderItemId ?? null, input.sourceChecklistId, input.code, input.name, input.type],
  );
  const checklist = checklistResult.rows[0];

  const items: WorkOrderChecklistItemRecord[] = [];
  for (const item of input.items) {
    const itemId = createId();
    const itemResult = await db.query<WorkOrderChecklistItemRecord>(
      `INSERT INTO work_order_checklist_items (id, "workOrderChecklistId", description, required, "sortOrder")
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${ITEM_COLUMNS}`,
      [itemId, checklist.id, item.description, item.required, item.sortOrder],
    );
    items.push(itemResult.rows[0]);
  }

  return { checklist, items };
}

export async function listWorkOrderChecklistItems(workOrderChecklistId: string, db: Queryable = pool): Promise<WorkOrderChecklistItemRecord[]> {
  const result = await db.query<WorkOrderChecklistItemRecord>(
    `SELECT ${ITEM_COLUMNS} FROM work_order_checklist_items WHERE "workOrderChecklistId" = $1 ORDER BY "sortOrder" ASC, id ASC`,
    [workOrderChecklistId],
  );
  return result.rows;
}

export async function findWorkOrderChecklistItemById(id: string, db: Queryable = pool): Promise<WorkOrderChecklistItemRecord | null> {
  const result = await db.query<WorkOrderChecklistItemRecord>(`SELECT ${ITEM_COLUMNS} FROM work_order_checklist_items WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function setWorkOrderChecklistItemChecked(
  id: string,
  checked: boolean,
  checkedByUserId: string | null,
  db: Queryable = pool,
): Promise<WorkOrderChecklistItemRecord | null> {
  const result = await db.query<WorkOrderChecklistItemRecord>(
    `UPDATE work_order_checklist_items SET
      checked = $2,
      "checkedAt" = CASE WHEN $2 THEN NOW() ELSE NULL END,
      "checkedByUserId" = CASE WHEN $2 THEN $3 ELSE NULL END
    WHERE id = $1
    RETURNING ${ITEM_COLUMNS}`,
    [id, checked, checkedByUserId],
  );
  return result.rows[0] ?? null;
}

export async function completeWorkOrderChecklist(
  id: string,
  completedByUserId: string,
  db: Queryable = pool,
): Promise<WorkOrderChecklistRecord | null> {
  const result = await db.query<WorkOrderChecklistRecord>(
    `UPDATE work_order_checklists SET "completedAt" = NOW(), "completedByUserId" = $2
     WHERE id = $1
     RETURNING ${CHECKLIST_COLUMNS}`,
    [id, completedByUserId],
  );
  return result.rows[0] ?? null;
}
