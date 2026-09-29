import { pool } from "../pool";
import { createId } from "@paralleldrive/cuid2";

export type ProcedureStatus = "ATIVO" | "INATIVO";

export interface ProcedureRecord {
  id: string;
  code: string;
  title: string;
  objective: string | null;
  prerequisites: string | null;
  steps: string | null;
  completionCriteria: string | null;
  status: ProcedureStatus;
  createdAt: Date;
  updatedAt: Date;
}

const COLUMNS = `id, code, title, objective, prerequisites, steps, "completionCriteria", status, "createdAt", "updatedAt"`;

export interface CreateProcedureInput {
  code: string;
  title: string;
  objective?: string | null;
  prerequisites?: string | null;
  steps?: string | null;
  completionCriteria?: string | null;
}

export async function createProcedure(input: CreateProcedureInput): Promise<ProcedureRecord> {
  const id = createId();
  const result = await pool.query<ProcedureRecord>(
    `INSERT INTO procedures (id, code, title, objective, prerequisites, steps, "completionCriteria", status, "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'ATIVO', NOW())
     RETURNING ${COLUMNS}`,
    [
      id,
      input.code,
      input.title,
      input.objective ?? null,
      input.prerequisites ?? null,
      input.steps ?? null,
      input.completionCriteria ?? null,
    ],
  );
  return result.rows[0];
}

export type UpdateProcedureInput = Partial<CreateProcedureInput>;

export async function updateProcedure(id: string, input: UpdateProcedureInput): Promise<ProcedureRecord | null> {
  const result = await pool.query<ProcedureRecord>(
    `UPDATE procedures SET
      code = COALESCE($2, code),
      title = COALESCE($3, title),
      objective = CASE WHEN $4::boolean THEN $5 ELSE objective END,
      prerequisites = CASE WHEN $6::boolean THEN $7 ELSE prerequisites END,
      steps = CASE WHEN $8::boolean THEN $9 ELSE steps END,
      "completionCriteria" = CASE WHEN $10::boolean THEN $11 ELSE "completionCriteria" END,
      "updatedAt" = NOW()
    WHERE id = $1
    RETURNING ${COLUMNS}`,
    [
      id,
      input.code ?? null,
      input.title ?? null,
      "objective" in input,
      input.objective ?? null,
      "prerequisites" in input,
      input.prerequisites ?? null,
      "steps" in input,
      input.steps ?? null,
      "completionCriteria" in input,
      input.completionCriteria ?? null,
    ],
  );
  return result.rows[0] ?? null;
}

export async function setProcedureStatus(id: string, status: ProcedureStatus): Promise<ProcedureRecord | null> {
  const result = await pool.query<ProcedureRecord>(
    `UPDATE procedures SET status = $2, "updatedAt" = NOW() WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, status],
  );
  return result.rows[0] ?? null;
}

export async function findProcedureById(id: string): Promise<ProcedureRecord | null> {
  const result = await pool.query<ProcedureRecord>(`SELECT ${COLUMNS} FROM procedures WHERE id = $1 LIMIT 1`, [id]);
  return result.rows[0] ?? null;
}

export async function findProcedureByCode(code: string): Promise<ProcedureRecord | null> {
  const result = await pool.query<ProcedureRecord>(`SELECT ${COLUMNS} FROM procedures WHERE code = $1 LIMIT 1`, [code]);
  return result.rows[0] ?? null;
}

export interface SearchProceduresFilters {
  query?: string;
  status?: ProcedureStatus;
  limit?: number;
}

export async function searchProcedures(filters: SearchProceduresFilters): Promise<{ items: ProcedureRecord[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.query && filters.query.trim() !== "") {
    params.push(`%${filters.query.trim()}%`);
    conditions.push(`(title ILIKE $${params.length} OR code ILIKE $${params.length})`);
  }
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`status = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit ?? 100;
  params.push(limit);

  const itemsResult = await pool.query<ProcedureRecord>(
    `SELECT ${COLUMNS} FROM procedures ${whereClause} ORDER BY code ASC LIMIT $${params.length}`,
    params,
  );
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM procedures ${whereClause}`,
    params.slice(0, params.length - 1),
  );

  return { items: itemsResult.rows, total: Number(countResult.rows[0]?.count ?? 0) };
}

export async function listActiveProcedures(): Promise<ProcedureRecord[]> {
  const result = await pool.query<ProcedureRecord>(
    `SELECT ${COLUMNS} FROM procedures WHERE status = 'ATIVO' ORDER BY code ASC`,
  );
  return result.rows;
}
