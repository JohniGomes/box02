import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";

export type PartStatus = "ATIVO" | "INATIVO";

export interface PartRecord {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  costCents: number | null;
  minStock: number | null;
  status: PartStatus;
  notes: string | null;
  markupPercent: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const COLUMNS = `id, name, sku, unit, "costCents", "minStock", status, notes, "markupPercent", "createdAt", "updatedAt"`;

export interface CreatePartInput {
  name: string;
  sku?: string | null;
  unit?: string;
  costCents?: number | null;
  minStock?: number | null;
  notes?: string | null;
  markupPercent?: number | null;
}

export async function createPart(input: CreatePartInput): Promise<PartRecord> {
  const id = createId();
  const result = await pool.query<PartRecord>(
    `INSERT INTO parts (id, name, sku, unit, "costCents", "minStock", notes, "markupPercent", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     RETURNING ${COLUMNS}`,
    [
      id,
      input.name,
      input.sku ?? null,
      input.unit ?? "un",
      input.costCents ?? null,
      input.minStock ?? null,
      input.notes ?? null,
      input.markupPercent ?? null,
    ],
  );
  return result.rows[0];
}

export type UpdatePartInput = Partial<CreatePartInput>;

export async function updatePart(id: string, input: UpdatePartInput): Promise<PartRecord | null> {
  const result = await pool.query<PartRecord>(
    `UPDATE parts SET
      name = COALESCE($2, name),
      sku = CASE WHEN $3::boolean THEN $4 ELSE sku END,
      unit = COALESCE($5, unit),
      "costCents" = CASE WHEN $6::boolean THEN $7 ELSE "costCents" END,
      "minStock" = CASE WHEN $8::boolean THEN $9 ELSE "minStock" END,
      notes = CASE WHEN $10::boolean THEN $11 ELSE notes END,
      "markupPercent" = CASE WHEN $12::boolean THEN $13 ELSE "markupPercent" END,
      "updatedAt" = NOW()
    WHERE id = $1
    RETURNING ${COLUMNS}`,
    [
      id,
      input.name ?? null,
      "sku" in input,
      input.sku ?? null,
      input.unit ?? null,
      "costCents" in input,
      input.costCents ?? null,
      "minStock" in input,
      input.minStock ?? null,
      "notes" in input,
      input.notes ?? null,
      "markupPercent" in input,
      input.markupPercent ?? null,
    ],
  );
  return result.rows[0] ?? null;
}

export async function setPartStatus(id: string, status: PartStatus): Promise<PartRecord | null> {
  const result = await pool.query<PartRecord>(
    `UPDATE parts SET status = $2, "updatedAt" = NOW() WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, status],
  );
  return result.rows[0] ?? null;
}

export async function findPartById(id: string): Promise<PartRecord | null> {
  const result = await pool.query<PartRecord>(`SELECT ${COLUMNS} FROM parts WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function findPartBySku(sku: string): Promise<PartRecord | null> {
  const result = await pool.query<PartRecord>(`SELECT ${COLUMNS} FROM parts WHERE sku = $1`, [sku]);
  return result.rows[0] ?? null;
}

export interface PartWithStock extends PartRecord {
  currentStock: number;
}

/** Lista peças com o saldo atual já calculado (soma das movimentações) —
 * evita N+1 query por peça pra montar a listagem. */
export async function listPartsWithStock(query?: string): Promise<PartWithStock[]> {
  const result = await pool.query<PartWithStock>(
    `SELECT
       p.id, p.name, p.sku, p.unit, p."costCents", p."minStock", p.status, p.notes,
       p."markupPercent", p."createdAt", p."updatedAt",
       COALESCE(SUM(CASE WHEN sm.type = 'ENTRADA' THEN sm.quantity ELSE -sm.quantity END), 0)::int as "currentStock"
     FROM parts p
     LEFT JOIN stock_movements sm ON sm."partId" = p.id
     WHERE ($1::text IS NULL OR p.name ILIKE '%' || $1 || '%' OR p.sku ILIKE '%' || $1 || '%')
     GROUP BY p.id
     ORDER BY p.name ASC`,
    [query ?? null],
  );
  return result.rows;
}

export async function getPartCurrentStock(partId: string): Promise<number> {
  const result = await pool.query<{ total: string | null }>(
    `SELECT COALESCE(SUM(CASE WHEN type = 'ENTRADA' THEN quantity ELSE -quantity END), 0) as total
     FROM stock_movements WHERE "partId" = $1`,
    [partId],
  );
  return Number(result.rows[0]?.total ?? 0);
}
