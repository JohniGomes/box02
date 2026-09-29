import type { Pool, PoolClient } from "pg";
import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";

type Queryable = Pool | PoolClient;

export type QuoteStatus =
  | "RASCUNHO"
  | "ENVIADO"
  | "APROVADO"
  | "APROVADO_PARCIAL"
  | "RECUSADO"
  | "EXPIRADO"
  | "CANCELADO";

export interface QuoteRecord {
  id: string;
  number: string;
  status: QuoteStatus;
  customerId: string;
  vehicleId: string;
  currentVersionNumber: number;
  createdByUserId: string | null;
  createdAt: Date;
}

export interface QuoteWithNames extends QuoteRecord {
  customerName: string;
  vehiclePlate: string | null;
  vehicleLabel: string;
}

const COLUMNS = `id, number, status, "customerId", "vehicleId", "currentVersionNumber", "createdByUserId", "createdAt"`;

export async function createQuote(
  input: { number: string; customerId: string; vehicleId: string; createdByUserId: string },
  db: Queryable = pool,
): Promise<QuoteRecord> {
  const id = createId();
  const result = await db.query<QuoteRecord>(
    `INSERT INTO quotes (id, number, status, "customerId", "vehicleId", "currentVersionNumber", "createdByUserId")
     VALUES ($1, $2, 'RASCUNHO', $3, $4, 1, $5)
     RETURNING ${COLUMNS}`,
    [id, input.number, input.customerId, input.vehicleId, input.createdByUserId],
  );
  return result.rows[0];
}

export async function updateQuoteStatusAndVersion(
  id: string,
  status: QuoteStatus,
  currentVersionNumber: number,
  db: Queryable = pool,
): Promise<void> {
  await db.query(`UPDATE quotes SET status = $2, "currentVersionNumber" = $3 WHERE id = $1`, [
    id,
    status,
    currentVersionNumber,
  ]);
}

export async function findQuoteById(id: string, db: Queryable = pool): Promise<QuoteRecord | null> {
  const result = await db.query<QuoteRecord>(`SELECT ${COLUMNS} FROM quotes WHERE id = $1 LIMIT 1`, [id]);
  return result.rows[0] ?? null;
}

export interface SearchQuotesFilters {
  query?: string;
  status?: QuoteStatus;
  customerId?: string;
  limit?: number;
  offset?: number;
}

export interface SearchQuotesResult {
  items: QuoteWithNames[];
  total: number;
}

export async function searchQuotes(filters: SearchQuotesFilters): Promise<SearchQuotesResult> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.query && filters.query.trim() !== "") {
    params.push(`%${filters.query.trim()}%`);
    const idx = params.length;
    conditions.push(`(q.number ILIKE $${idx} OR c."legalName" ILIKE $${idx} OR v.plate LIKE $${idx})`);
  }
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`q.status = $${params.length}`);
  }
  if (filters.customerId) {
    params.push(filters.customerId);
    conditions.push(`q."customerId" = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit ?? 20;
  const offset = filters.offset ?? 0;
  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const itemsResult = await pool.query<QuoteWithNames>(
    `SELECT q.id, q.number, q.status, q."customerId", q."vehicleId", q."currentVersionNumber",
            q."createdByUserId", q."createdAt",
            c."legalName" as "customerName", v.plate as "vehiclePlate",
            TRIM(CONCAT(COALESCE(v.brand,''), ' ', COALESCE(v.model,''))) as "vehicleLabel"
     FROM quotes q
     INNER JOIN customers c ON c.id = q."customerId"
     INNER JOIN vehicles v ON v.id = q."vehicleId"
     ${whereClause}
     ORDER BY q."createdAt" DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params,
  );

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM quotes q
     INNER JOIN customers c ON c.id = q."customerId"
     INNER JOIN vehicles v ON v.id = q."vehicleId"
     ${whereClause}`,
    params.slice(0, params.length - 2),
  );

  return { items: itemsResult.rows, total: Number(countResult.rows[0]?.count ?? 0) };
}
