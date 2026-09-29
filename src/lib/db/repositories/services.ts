import { pool } from "../pool";
import { createId } from "@paralleldrive/cuid2";

export type ServiceStatus = "ATIVO" | "INATIVO";

export interface ServiceRecord {
  id: string;
  name: string;
  category: string | null;
  defaultPriceCents: number | null;
  costCents: number | null;
  status: ServiceStatus;
  procedureId: string | null;
  executionChecklistId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const COLUMNS = `id, name, category, "defaultPriceCents", "costCents", status, "procedureId", "executionChecklistId", "createdAt", "updatedAt"`;

export interface CreateServiceInput {
  name: string;
  category?: string | null;
  defaultPriceCents?: number | null;
  costCents?: number | null;
}

export async function createService(input: CreateServiceInput): Promise<ServiceRecord> {
  const id = createId();
  const result = await pool.query<ServiceRecord>(
    `INSERT INTO services (id, name, category, "defaultPriceCents", "costCents", status, "updatedAt")
     VALUES ($1, $2, $3, $4, $5, 'ATIVO', NOW())
     RETURNING ${COLUMNS}`,
    [id, input.name, input.category ?? null, input.defaultPriceCents ?? null, input.costCents ?? null],
  );
  return result.rows[0];
}

export type UpdateServiceInput = Partial<CreateServiceInput>;

export async function updateService(id: string, input: UpdateServiceInput): Promise<ServiceRecord | null> {
  const result = await pool.query<ServiceRecord>(
    `UPDATE services SET
      name = COALESCE($2, name),
      category = CASE WHEN $3::boolean THEN $4 ELSE category END,
      "defaultPriceCents" = CASE WHEN $5::boolean THEN $6 ELSE "defaultPriceCents" END,
      "costCents" = CASE WHEN $7::boolean THEN $8 ELSE "costCents" END,
      "updatedAt" = NOW()
    WHERE id = $1
    RETURNING ${COLUMNS}`,
    [
      id,
      input.name ?? null,
      "category" in input,
      input.category ?? null,
      "defaultPriceCents" in input,
      input.defaultPriceCents ?? null,
      "costCents" in input,
      input.costCents ?? null,
    ],
  );
  return result.rows[0] ?? null;
}

/** Ciclo D — associa/desassocia procedimento e checklist de execução.
 * `undefined` = não mexe no campo; `null` = desassocia explicitamente. */
export async function setServiceProcedureAndChecklist(
  id: string,
  input: { procedureId?: string | null; executionChecklistId?: string | null },
): Promise<ServiceRecord | null> {
  const result = await pool.query<ServiceRecord>(
    `UPDATE services SET
      "procedureId" = CASE WHEN $2::boolean THEN $3 ELSE "procedureId" END,
      "executionChecklistId" = CASE WHEN $4::boolean THEN $5 ELSE "executionChecklistId" END,
      "updatedAt" = NOW()
    WHERE id = $1
    RETURNING ${COLUMNS}`,
    [
      id,
      "procedureId" in input,
      input.procedureId ?? null,
      "executionChecklistId" in input,
      input.executionChecklistId ?? null,
    ],
  );
  return result.rows[0] ?? null;
}

export async function setServiceStatus(id: string, status: ServiceStatus): Promise<ServiceRecord | null> {
  const result = await pool.query<ServiceRecord>(
    `UPDATE services SET status = $2, "updatedAt" = NOW() WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, status],
  );
  return result.rows[0] ?? null;
}

export async function findServiceById(id: string): Promise<ServiceRecord | null> {
  const result = await pool.query<ServiceRecord>(`SELECT ${COLUMNS} FROM services WHERE id = $1 LIMIT 1`, [id]);
  return result.rows[0] ?? null;
}

export interface SearchServicesFilters {
  query?: string;
  status?: ServiceStatus;
  limit?: number;
  offset?: number;
}

export interface SearchServicesResult {
  items: ServiceRecord[];
  total: number;
}

export async function searchServices(filters: SearchServicesFilters): Promise<SearchServicesResult> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.query && filters.query.trim() !== "") {
    params.push(`%${filters.query.trim()}%`);
    conditions.push(`(name ILIKE $${params.length} OR category ILIKE $${params.length})`);
  }
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`status = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const itemsResult = await pool.query<ServiceRecord>(
    `SELECT ${COLUMNS} FROM services ${whereClause} ORDER BY name ASC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params,
  );
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM services ${whereClause}`,
    params.slice(0, params.length - 2),
  );

  return { items: itemsResult.rows, total: Number(countResult.rows[0]?.count ?? 0) };
}

/**
 * Só serviços ATIVOS — é a função que o Ciclo B vai usar para o seletor
 * de serviço no orçamento/OS/adicional (inativo não deve aparecer como
 * opção para novos registros, mesmo continuando a existir no banco para
 * o que já referencia ele historicamente).
 */
export async function listActiveServices(): Promise<ServiceRecord[]> {
  const result = await pool.query<ServiceRecord>(
    `SELECT ${COLUMNS} FROM services WHERE status = 'ATIVO' ORDER BY name ASC`,
  );
  return result.rows;
}
