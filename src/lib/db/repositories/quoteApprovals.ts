import type { Pool, PoolClient } from "pg";
import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";
import type { QuoteAccessChannel } from "./quoteAccessLinks";

type Queryable = Pool | PoolClient;

export type QuoteApprovalDecision = "APROVADO" | "APROVADO_PARCIAL" | "RECUSADO";

export interface QuoteApprovalRecord {
  id: string;
  quoteVersionId: string;
  decision: QuoteApprovalDecision;
  approverName: string;
  approverDocument: string | null;
  reason: string | null;
  notes: string | null;
  channel: QuoteAccessChannel;
  decidedAt: Date;
  ipAddress: string | null;
}

const COLUMNS = `
  id, "quoteVersionId", decision, "approverName", "approverDocument",
  reason, notes, channel, "decidedAt", "ipAddress"
`;

export interface CreateQuoteApprovalInput {
  quoteVersionId: string;
  decision: QuoteApprovalDecision;
  approverName: string;
  approverDocument?: string | null;
  reason?: string | null;
  notes?: string | null;
  channel?: QuoteAccessChannel;
  ipAddress?: string | null;
}

export async function createQuoteApproval(
  input: CreateQuoteApprovalInput,
  db: Queryable = pool,
): Promise<QuoteApprovalRecord> {
  const id = createId();
  const result = await db.query<QuoteApprovalRecord>(
    `INSERT INTO quote_approvals (
      id, "quoteVersionId", decision, "approverName", "approverDocument",
      reason, notes, channel, "ipAddress"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING ${COLUMNS}`,
    [
      id,
      input.quoteVersionId,
      input.decision,
      input.approverName,
      input.approverDocument ?? null,
      input.reason ?? null,
      input.notes ?? null,
      input.channel ?? "LINK",
      input.ipAddress ?? null,
    ],
  );
  return result.rows[0];
}

export async function findQuoteApprovalByVersion(
  quoteVersionId: string,
  db: Queryable = pool,
): Promise<QuoteApprovalRecord | null> {
  const result = await db.query<QuoteApprovalRecord>(
    `SELECT ${COLUMNS} FROM quote_approvals WHERE "quoteVersionId" = $1 LIMIT 1`,
    [quoteVersionId],
  );
  return result.rows[0] ?? null;
}
