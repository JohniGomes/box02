import type { Pool, PoolClient } from "pg";
import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";

type Queryable = Pool | PoolClient;

export type StockMovementType = "ENTRADA" | "SAIDA";

export interface StockMovementRecord {
  id: string;
  partId: string;
  type: StockMovementType;
  quantity: number;
  reason: string | null;
  purchaseId: string | null;
  createdByUserId: string;
  createdAt: Date;
}

const COLUMNS = `id, "partId", type, quantity, reason, "purchaseId", "createdByUserId", "createdAt"`;

/** Write-once (sem update/delete) — corrigir um lançamento errado é
 * lançar o movimento inverso, mesmo padrão de WorkOrderPayment. */
export async function createStockMovement(
  input: {
    partId: string;
    type: StockMovementType;
    quantity: number;
    reason?: string | null;
    purchaseId?: string | null;
    createdByUserId: string;
  },
  db: Queryable = pool,
): Promise<StockMovementRecord> {
  const id = createId();
  const result = await db.query<StockMovementRecord>(
    `INSERT INTO stock_movements (id, "partId", type, quantity, reason, "purchaseId", "createdByUserId")
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${COLUMNS}`,
    [id, input.partId, input.type, input.quantity, input.reason ?? null, input.purchaseId ?? null, input.createdByUserId],
  );
  return result.rows[0];
}

export async function listStockMovementsByPart(partId: string): Promise<StockMovementRecord[]> {
  const result = await pool.query<StockMovementRecord>(
    `SELECT ${COLUMNS} FROM stock_movements WHERE "partId" = $1 ORDER BY "createdAt" DESC`,
    [partId],
  );
  return result.rows;
}

export async function listRecentStockMovements(limit: number): Promise<StockMovementRecord[]> {
  const result = await pool.query<StockMovementRecord>(
    `SELECT ${COLUMNS} FROM stock_movements ORDER BY "createdAt" DESC LIMIT $1`,
    [limit],
  );
  return result.rows;
}
