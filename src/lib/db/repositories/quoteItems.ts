import type { Pool, PoolClient } from "pg";
import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";

type Queryable = Pool | PoolClient;

export type QuoteItemType = "SERVICO" | "PECA" | "MAO_DE_OBRA";
export type QuoteItemDecision = "PENDENTE" | "APROVADO" | "RECUSADO";
export type QuoteItemCategory = "NECESSARIO" | "RECOMENDADO" | "INFORMATIVO";

export interface QuoteItemRecord {
  id: string;
  quoteVersionId: string;
  type: QuoteItemType;
  description: string;
  quantity: string; // NUMERIC vem como string do pg — converter na borda
  unitPriceCents: number;
  totalCents: number;
  clientDecision: QuoteItemDecision;
  category: QuoteItemCategory;
  catalogItemType: string | null;
  catalogItemId: string | null;
  serviceId: string | null;
}

const COLUMNS = `
  id, "quoteVersionId", type, description, quantity, "unitPriceCents", "totalCents",
  "clientDecision", category, "catalogItemType", "catalogItemId", "serviceId"
`;

export interface CreateQuoteItemInput {
  quoteVersionId: string;
  type: QuoteItemType;
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  category: QuoteItemCategory;
  catalogItemType?: string | null;
  catalogItemId?: string | null;
  serviceId?: string | null;
}

export async function insertQuoteItems(
  items: CreateQuoteItemInput[],
  db: Queryable = pool,
): Promise<QuoteItemRecord[]> {
  const inserted: QuoteItemRecord[] = [];
  for (const item of items) {
    const id = createId();
    const result = await db.query<QuoteItemRecord>(
      `INSERT INTO quote_items (
        id, "quoteVersionId", type, description, quantity, "unitPriceCents", "totalCents",
        category, "catalogItemType", "catalogItemId", "serviceId"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING ${COLUMNS}`,
      [
        id,
        item.quoteVersionId,
        item.type,
        item.description,
        item.quantity,
        item.unitPriceCents,
        item.totalCents,
        item.category,
        item.catalogItemType ?? null,
        item.catalogItemId ?? null,
        item.serviceId ?? null,
      ],
    );
    inserted.push(result.rows[0]);
  }
  return inserted;
}

export async function deleteQuoteItemsByVersion(
  quoteVersionId: string,
  db: Queryable = pool,
): Promise<void> {
  await db.query(`DELETE FROM quote_items WHERE "quoteVersionId" = $1`, [quoteVersionId]);
}

export async function listQuoteItemsByVersion(
  quoteVersionId: string,
  db: Queryable = pool,
): Promise<QuoteItemRecord[]> {
  const result = await db.query<QuoteItemRecord>(
    `SELECT ${COLUMNS} FROM quote_items WHERE "quoteVersionId" = $1 ORDER BY type, description`,
    [quoteVersionId],
  );
  return result.rows;
}

export async function setQuoteItemDecision(
  id: string,
  decision: QuoteItemDecision,
  db: Queryable = pool,
): Promise<void> {
  await db.query(`UPDATE quote_items SET "clientDecision" = $2 WHERE id = $1`, [id, decision]);
}

export async function findQuoteItemById(
  id: string,
  db: Queryable = pool,
): Promise<QuoteItemRecord | null> {
  const result = await db.query<QuoteItemRecord>(`SELECT ${COLUMNS} FROM quote_items WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}
