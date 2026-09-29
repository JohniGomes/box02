import type { Pool, PoolClient } from "pg";
import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";
import type { QuoteStatus } from "./quotes";

type Queryable = Pool | PoolClient;

export type QuoteAdjustmentType = "PERCENTUAL" | "FIXO";

export interface QuoteVersionRecord {
  id: string;
  quoteId: string;
  versionNumber: number;
  status: QuoteStatus;
  validUntil: Date;
  sentAt: Date | null;
  decidedAt: Date | null;
  internalNotes: string | null;
  customerMessage: string | null;
  subtotalServicesCents: number;
  subtotalPartsCents: number;
  subtotalLaborCents: number;
  discountType: QuoteAdjustmentType | null;
  discountValue: number | null;
  discountTotalCents: number;
  surchargeType: QuoteAdjustmentType | null;
  surchargeValue: number | null;
  surchargeTotalCents: number;
  totalCents: number;
  createdByUserId: string | null;
  createdAt: Date;
}

const COLUMNS = `
  id, "quoteId", "versionNumber", status, "validUntil", "sentAt", "decidedAt",
  "internalNotes", "customerMessage",
  "subtotalServicesCents", "subtotalPartsCents", "subtotalLaborCents",
  "discountType", "discountValue", "discountTotalCents",
  "surchargeType", "surchargeValue", "surchargeTotalCents",
  "totalCents", "createdByUserId", "createdAt"
`;

export interface CreateQuoteVersionInput {
  quoteId: string;
  versionNumber: number;
  validUntil: Date;
  internalNotes?: string | null;
  customerMessage?: string | null;
  subtotalServicesCents: number;
  subtotalPartsCents: number;
  subtotalLaborCents: number;
  discountType?: QuoteAdjustmentType | null;
  discountValue?: number | null;
  discountTotalCents: number;
  surchargeType?: QuoteAdjustmentType | null;
  surchargeValue?: number | null;
  surchargeTotalCents: number;
  totalCents: number;
  createdByUserId: string;
}

export async function createQuoteVersion(
  input: CreateQuoteVersionInput,
  db: Queryable = pool,
): Promise<QuoteVersionRecord> {
  const id = createId();
  const result = await db.query<QuoteVersionRecord>(
    `INSERT INTO quote_versions (
      id, "quoteId", "versionNumber", status, "validUntil",
      "internalNotes", "customerMessage",
      "subtotalServicesCents", "subtotalPartsCents", "subtotalLaborCents",
      "discountType", "discountValue", "discountTotalCents",
      "surchargeType", "surchargeValue", "surchargeTotalCents",
      "totalCents", "createdByUserId"
    ) VALUES (
      $1, $2, $3, 'RASCUNHO', $4,
      $5, $6,
      $7, $8, $9,
      $10, $11, $12,
      $13, $14, $15,
      $16, $17
    ) RETURNING ${COLUMNS}`,
    [
      id,
      input.quoteId,
      input.versionNumber,
      input.validUntil,
      input.internalNotes ?? null,
      input.customerMessage ?? null,
      input.subtotalServicesCents,
      input.subtotalPartsCents,
      input.subtotalLaborCents,
      input.discountType ?? null,
      input.discountValue ?? null,
      input.discountTotalCents,
      input.surchargeType ?? null,
      input.surchargeValue ?? null,
      input.surchargeTotalCents,
      input.totalCents,
      input.createdByUserId,
    ],
  );
  return result.rows[0];
}

export type UpdateQuoteVersionContentInput = Omit<
  CreateQuoteVersionInput,
  "quoteId" | "versionNumber" | "createdByUserId"
>;

/** Só deve ser chamado para uma versão em RASCUNHO — a garantia disso é do serviço, não do repositório. */
export async function updateQuoteVersionContent(
  id: string,
  input: UpdateQuoteVersionContentInput,
  db: Queryable = pool,
): Promise<QuoteVersionRecord | null> {
  const result = await db.query<QuoteVersionRecord>(
    `UPDATE quote_versions SET
      "validUntil" = $2,
      "internalNotes" = $3,
      "customerMessage" = $4,
      "subtotalServicesCents" = $5,
      "subtotalPartsCents" = $6,
      "subtotalLaborCents" = $7,
      "discountType" = $8,
      "discountValue" = $9,
      "discountTotalCents" = $10,
      "surchargeType" = $11,
      "surchargeValue" = $12,
      "surchargeTotalCents" = $13,
      "totalCents" = $14
    WHERE id = $1
    RETURNING ${COLUMNS}`,
    [
      id,
      input.validUntil,
      input.internalNotes ?? null,
      input.customerMessage ?? null,
      input.subtotalServicesCents,
      input.subtotalPartsCents,
      input.subtotalLaborCents,
      input.discountType ?? null,
      input.discountValue ?? null,
      input.discountTotalCents,
      input.surchargeType ?? null,
      input.surchargeValue ?? null,
      input.surchargeTotalCents,
      input.totalCents,
    ],
  );
  return result.rows[0] ?? null;
}

export async function setQuoteVersionStatus(
  id: string,
  status: QuoteStatus,
  extra: { sentAt?: Date; decidedAt?: Date } = {},
  db: Queryable = pool,
): Promise<QuoteVersionRecord | null> {
  const result = await db.query<QuoteVersionRecord>(
    `UPDATE quote_versions SET
      status = $2,
      "sentAt" = COALESCE($3, "sentAt"),
      "decidedAt" = COALESCE($4, "decidedAt")
    WHERE id = $1
    RETURNING ${COLUMNS}`,
    [id, status, extra.sentAt ?? null, extra.decidedAt ?? null],
  );
  return result.rows[0] ?? null;
}

export async function findQuoteVersionById(
  id: string,
  db: Queryable = pool,
): Promise<QuoteVersionRecord | null> {
  const result = await db.query<QuoteVersionRecord>(
    `SELECT ${COLUMNS} FROM quote_versions WHERE id = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] ?? null;
}

/**
 * Mesma coisa que `findQuoteVersionById`, mas com `FOR UPDATE` — trava a
 * linha até o fim da transação. Usado exclusivamente na submissão pública
 * de decisão (ver quotes/service.ts `submitPublicQuoteDecisionService`):
 * garante que duas submissões simultâneas do mesmo link nunca apliquem a
 * decisão duas vezes — a segunda espera a primeira liberar a trava e, ao
 * ler o status já atualizado, é rejeitada como decisão duplicada.
 */
export async function lockQuoteVersionById(
  id: string,
  client: PoolClient,
): Promise<QuoteVersionRecord | null> {
  const result = await client.query<QuoteVersionRecord>(
    `SELECT ${COLUMNS} FROM quote_versions WHERE id = $1 LIMIT 1 FOR UPDATE`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function findQuoteVersionByNumber(
  quoteId: string,
  versionNumber: number,
  db: Queryable = pool,
): Promise<QuoteVersionRecord | null> {
  const result = await db.query<QuoteVersionRecord>(
    `SELECT ${COLUMNS} FROM quote_versions WHERE "quoteId" = $1 AND "versionNumber" = $2 LIMIT 1`,
    [quoteId, versionNumber],
  );
  return result.rows[0] ?? null;
}

export async function listQuoteVersionsByQuote(
  quoteId: string,
  db: Queryable = pool,
): Promise<QuoteVersionRecord[]> {
  const result = await db.query<QuoteVersionRecord>(
    `SELECT ${COLUMNS} FROM quote_versions WHERE "quoteId" = $1 ORDER BY "versionNumber" DESC`,
    [quoteId],
  );
  return result.rows;
}
