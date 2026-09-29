import type { Pool, PoolClient } from "pg";
import { pool } from "../pool";
import { createId } from "@paralleldrive/cuid2";

type Queryable = Pool | PoolClient;

export type ChecklistStatus = "ATIVO" | "INATIVO";
export type ChecklistType = "ENTRADA" | "EXECUCAO" | "ENTREGA";

export interface ChecklistRecord {
  id: string;
  code: string;
  name: string;
  type: ChecklistType;
  status: ChecklistStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChecklistItemRecord {
  id: string;
  checklistId: string;
  description: string;
  required: boolean;
  sortOrder: number;
}

const CHECKLIST_COLUMNS = `id, code, name, type, status, "createdAt", "updatedAt"`;
const ITEM_COLUMNS = `id, "checklistId", description, required, "sortOrder"`;

export interface CreateChecklistInput {
  code: string;
  name: string;
  type: ChecklistType;
}

export async function createChecklist(input: CreateChecklistInput, db: Queryable = pool): Promise<ChecklistRecord> {
  const id = createId();
  const result = await db.query<ChecklistRecord>(
    `INSERT INTO checklists (id, code, name, type, status, "updatedAt")
     VALUES ($1, $2, $3, $4, 'ATIVO', NOW())
     RETURNING ${CHECKLIST_COLUMNS}`,
    [id, input.code, input.name, input.type],
  );
  return result.rows[0];
}

export interface UpdateChecklistInput {
  code?: string;
  name?: string;
}

export async function updateChecklist(id: string, input: UpdateChecklistInput): Promise<ChecklistRecord | null> {
  const result = await pool.query<ChecklistRecord>(
    `UPDATE checklists SET code = COALESCE($2, code), name = COALESCE($3, name), "updatedAt" = NOW()
     WHERE id = $1 RETURNING ${CHECKLIST_COLUMNS}`,
    [id, input.code ?? null, input.name ?? null],
  );
  return result.rows[0] ?? null;
}

export async function setChecklistStatus(id: string, status: ChecklistStatus): Promise<ChecklistRecord | null> {
  const result = await pool.query<ChecklistRecord>(
    `UPDATE checklists SET status = $2, "updatedAt" = NOW() WHERE id = $1 RETURNING ${CHECKLIST_COLUMNS}`,
    [id, status],
  );
  return result.rows[0] ?? null;
}

export async function findChecklistById(id: string, db: Queryable = pool): Promise<ChecklistRecord | null> {
  const result = await db.query<ChecklistRecord>(`SELECT ${CHECKLIST_COLUMNS} FROM checklists WHERE id = $1 LIMIT 1`, [id]);
  return result.rows[0] ?? null;
}

export async function findChecklistByCode(code: string, db: Queryable = pool): Promise<ChecklistRecord | null> {
  const result = await db.query<ChecklistRecord>(`SELECT ${CHECKLIST_COLUMNS} FROM checklists WHERE code = $1 LIMIT 1`, [code]);
  return result.rows[0] ?? null;
}

/** Único ATIVO de um tipo (ENTRADA/ENTREGA) por vez — usado para validar
 * a regra de negócio antes de ativar outro do mesmo tipo. */
export async function findActiveChecklistByType(type: ChecklistType, db: Queryable = pool): Promise<ChecklistRecord | null> {
  const result = await db.query<ChecklistRecord>(
    `SELECT ${CHECKLIST_COLUMNS} FROM checklists WHERE type = $1 AND status = 'ATIVO' LIMIT 1`,
    [type],
  );
  return result.rows[0] ?? null;
}

export interface SearchChecklistsFilters {
  query?: string;
  type?: ChecklistType;
  status?: ChecklistStatus;
  limit?: number;
}

export async function searchChecklists(filters: SearchChecklistsFilters): Promise<{ items: ChecklistRecord[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.query && filters.query.trim() !== "") {
    params.push(`%${filters.query.trim()}%`);
    conditions.push(`(name ILIKE $${params.length} OR code ILIKE $${params.length})`);
  }
  if (filters.type) {
    params.push(filters.type);
    conditions.push(`type = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`status = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit ?? 100;
  params.push(limit);

  const itemsResult = await pool.query<ChecklistRecord>(
    `SELECT ${CHECKLIST_COLUMNS} FROM checklists ${whereClause} ORDER BY code ASC LIMIT $${params.length}`,
    params,
  );
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM checklists ${whereClause}`,
    params.slice(0, params.length - 1),
  );
  return { items: itemsResult.rows, total: Number(countResult.rows[0]?.count ?? 0) };
}

// ---- Itens do checklist ----

export async function listChecklistItems(checklistId: string, db: Queryable = pool): Promise<ChecklistItemRecord[]> {
  const result = await db.query<ChecklistItemRecord>(
    `SELECT ${ITEM_COLUMNS} FROM checklist_items WHERE "checklistId" = $1 ORDER BY "sortOrder" ASC, id ASC`,
    [checklistId],
  );
  return result.rows;
}

export interface CreateChecklistItemInput {
  checklistId: string;
  description: string;
  required?: boolean;
  sortOrder?: number;
}

export async function createChecklistItem(input: CreateChecklistItemInput, db: Queryable = pool): Promise<ChecklistItemRecord> {
  const id = createId();
  const result = await db.query<ChecklistItemRecord>(
    `INSERT INTO checklist_items (id, "checklistId", description, required, "sortOrder")
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${ITEM_COLUMNS}`,
    [id, input.checklistId, input.description, input.required ?? true, input.sortOrder ?? 0],
  );
  return result.rows[0];
}

export interface UpdateChecklistItemInput {
  description?: string;
  required?: boolean;
  sortOrder?: number;
}

export async function updateChecklistItem(id: string, input: UpdateChecklistItemInput): Promise<ChecklistItemRecord | null> {
  const result = await pool.query<ChecklistItemRecord>(
    `UPDATE checklist_items SET
      description = COALESCE($2, description),
      required = COALESCE($3, required),
      "sortOrder" = COALESCE($4, "sortOrder")
    WHERE id = $1
    RETURNING ${ITEM_COLUMNS}`,
    [id, input.description ?? null, input.required ?? null, input.sortOrder ?? null],
  );
  return result.rows[0] ?? null;
}

export async function deleteChecklistItem(id: string): Promise<void> {
  await pool.query(`DELETE FROM checklist_items WHERE id = $1`, [id]);
}

export async function findChecklistItemById(id: string): Promise<ChecklistItemRecord | null> {
  const result = await pool.query<ChecklistItemRecord>(`SELECT ${ITEM_COLUMNS} FROM checklist_items WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}
