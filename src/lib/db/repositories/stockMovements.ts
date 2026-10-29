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
  workOrderItemId: string | null;
  source: "OS_BAIXA" | "OS_DEVOLUCAO" | "OS_REBAIXA" | null;
  createdByUserId: string;
  createdAt: Date;
}

const COLUMNS = `id, "partId", type, quantity, reason, "purchaseId", "workOrderItemId", source, "createdByUserId", "createdAt"`;

/** Write-once (sem update/delete) — corrigir um lançamento errado é
 * lançar o movimento inverso, mesmo padrão de WorkOrderPayment. */
export async function createStockMovement(
  input: {
    partId: string;
    type: StockMovementType;
    quantity: number;
    reason?: string | null;
    purchaseId?: string | null;
    workOrderItemId?: string | null;
    source?: "OS_BAIXA" | "OS_DEVOLUCAO" | "OS_REBAIXA" | null;
    createdByUserId: string;
  },
  db: Queryable = pool,
): Promise<StockMovementRecord> {
  const id = createId();
  const result = await db.query<StockMovementRecord>(
    `INSERT INTO stock_movements (id, "partId", type, quantity, reason, "purchaseId", "workOrderItemId", source, "createdByUserId")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${COLUMNS}`,
    [
      id,
      input.partId,
      input.type,
      input.quantity,
      input.reason ?? null,
      input.purchaseId ?? null,
      input.workOrderItemId ?? null,
      input.source ?? null,
      input.createdByUserId,
    ],
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

/**
 * Quanto do item da OS está DEVOLVIDO ao estoque agora: devoluções (entradas) menos novas baixas
 * (saídas) feitas depois de uma reativação. Maior que zero = as peças estão de volta no estoque.
 */
export async function getReturnedQuantityForWorkOrderItem(workOrderItemId: string, db: Queryable = pool): Promise<number> {
  const result = await db.query<{ net: string | null }>(
    `SELECT COALESCE(SUM(CASE WHEN source = 'OS_DEVOLUCAO' THEN quantity WHEN source = 'OS_REBAIXA' THEN -quantity ELSE 0 END), 0) AS net
     FROM stock_movements WHERE "workOrderItemId" = $1`,
    [workOrderItemId],
  );
  return Number(result.rows[0]?.net ?? 0);
}
