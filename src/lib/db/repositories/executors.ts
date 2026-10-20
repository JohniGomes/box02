import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";

export type ExecutorStatus = "ATIVO" | "INATIVO";

export interface ExecutorRecord {
  id: string;
  name: string;
  status: ExecutorStatus;
  createdAt: Date;
}

const COLUMNS = `id, name, status, "createdAt"`;

export async function listExecutors(onlyActive = false): Promise<ExecutorRecord[]> {
  const result = await pool.query<ExecutorRecord>(
    `SELECT ${COLUMNS} FROM executors
     WHERE ($1::boolean = false OR status = 'ATIVO')
     ORDER BY status ASC, name ASC`,
    [onlyActive],
  );
  return result.rows;
}

export async function findExecutorById(id: string): Promise<ExecutorRecord | null> {
  const result = await pool.query<ExecutorRecord>(`SELECT ${COLUMNS} FROM executors WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

/** Nome igual (sem diferenciar maiúsculas/minúsculas), ignorando espaços nas pontas. */
export async function findExecutorByName(name: string): Promise<ExecutorRecord | null> {
  const result = await pool.query<ExecutorRecord>(
    `SELECT ${COLUMNS} FROM executors WHERE lower(btrim(name)) = lower(btrim($1)) LIMIT 1`,
    [name],
  );
  return result.rows[0] ?? null;
}

export async function createExecutor(name: string): Promise<ExecutorRecord> {
  const result = await pool.query<ExecutorRecord>(
    `INSERT INTO executors (id, name) VALUES ($1, $2) RETURNING ${COLUMNS}`,
    [createId(), name],
  );
  return result.rows[0];
}

export async function setExecutorStatus(id: string, status: ExecutorStatus): Promise<ExecutorRecord | null> {
  const result = await pool.query<ExecutorRecord>(
    `UPDATE executors SET status = $2 WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, status],
  );
  return result.rows[0] ?? null;
}
