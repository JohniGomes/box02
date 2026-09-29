import type { Pool, PoolClient } from "pg";
import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";

type Queryable = Pool | PoolClient;

export type QuoteAccessChannel = "LINK" | "PRESENCIAL";

export interface QuoteAccessLinkRecord {
  id: string;
  quoteVersionId: string;
  token: string;
  channel: QuoteAccessChannel;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

const COLUMNS = `id, "quoteVersionId", token, channel, "createdAt", "expiresAt", "revokedAt"`;

export async function createQuoteAccessLink(
  input: { quoteVersionId: string; token: string; expiresAt: Date; channel?: QuoteAccessChannel },
  db: Queryable = pool,
): Promise<QuoteAccessLinkRecord> {
  const id = createId();
  const result = await db.query<QuoteAccessLinkRecord>(
    `INSERT INTO quote_access_links (id, "quoteVersionId", token, channel, "expiresAt")
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLUMNS}`,
    [id, input.quoteVersionId, input.token, input.channel ?? "LINK", input.expiresAt],
  );
  return result.rows[0];
}

export async function findQuoteAccessLinkByToken(
  token: string,
  db: Queryable = pool,
): Promise<QuoteAccessLinkRecord | null> {
  const result = await db.query<QuoteAccessLinkRecord>(
    `SELECT ${COLUMNS} FROM quote_access_links WHERE token = $1 LIMIT 1`,
    [token],
  );
  return result.rows[0] ?? null;
}

/** Revoga todos os links ATIVOS (ainda não revogados) de uma versão. */
export async function revokeActiveLinksForVersion(
  quoteVersionId: string,
  db: Queryable = pool,
): Promise<number> {
  const result = await db.query(
    `UPDATE quote_access_links SET "revokedAt" = NOW()
     WHERE "quoteVersionId" = $1 AND "revokedAt" IS NULL`,
    [quoteVersionId],
  );
  return result.rowCount ?? 0;
}

export async function findActiveLinkForVersion(
  quoteVersionId: string,
  db: Queryable = pool,
): Promise<QuoteAccessLinkRecord | null> {
  const result = await db.query<QuoteAccessLinkRecord>(
    `SELECT ${COLUMNS} FROM quote_access_links
     WHERE "quoteVersionId" = $1 AND "revokedAt" IS NULL
     ORDER BY "createdAt" DESC LIMIT 1`,
    [quoteVersionId],
  );
  return result.rows[0] ?? null;
}
