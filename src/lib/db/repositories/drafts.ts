import type { Pool, PoolClient } from "pg";
import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";

type Queryable = Pool | PoolClient;

export interface DraftRecord {
  id: string;
  kind: string;
  title: string;
  payload: unknown;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

const COLUMNS = `id, kind, title, payload, "createdByUserId", "createdAt", "updatedAt"`;

export async function createDraft(
  input: { kind: string; title: string; payload: unknown; createdByUserId: string },
  db: Queryable = pool,
): Promise<DraftRecord> {
  const result = await db.query<DraftRecord>(
    `INSERT INTO drafts (id, kind, title, payload, "createdByUserId") VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING ${COLUMNS}`,
    [createId(), input.kind, input.title, JSON.stringify(input.payload), input.createdByUserId],
  );
  return result.rows[0];
}

export async function updateDraft(
  id: string,
  input: { title: string; payload: unknown },
  db: Queryable = pool,
): Promise<DraftRecord | null> {
  const result = await db.query<DraftRecord>(
    `UPDATE drafts SET title = $2, payload = $3::jsonb, "updatedAt" = NOW() WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, input.title, JSON.stringify(input.payload)],
  );
  return result.rows[0] ?? null;
}

export async function findDraftById(id: string, db: Queryable = pool): Promise<DraftRecord | null> {
  const result = await db.query<DraftRecord>(`SELECT ${COLUMNS} FROM drafts WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function listDrafts(limit: number, db: Queryable = pool): Promise<DraftRecord[]> {
  const result = await db.query<DraftRecord>(`SELECT ${COLUMNS} FROM drafts ORDER BY "updatedAt" DESC LIMIT $1`, [limit]);
  return result.rows;
}

export async function deleteDraft(id: string, db: Queryable = pool): Promise<void> {
  await db.query(`DELETE FROM drafts WHERE id = $1`, [id]);
}

/** Apaga rascunhos esquecidos há mais de `days` dias. */
export async function deleteStaleDrafts(days: number, db: Queryable = pool): Promise<number> {
  const result = await db.query(`DELETE FROM drafts WHERE "updatedAt" < NOW() - ($1 || ' days')::interval`, [String(days)]);
  return result.rowCount ?? 0;
}
