import type { Pool, PoolClient } from "pg";
import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";

type Queryable = Pool | PoolClient;

export interface PurchaseRecord {
  id: string;
  supplierId: string | null;
  supplierName: string | null;
  /** Coluna DATE — sempre "YYYY-MM-DD". */
  purchaseDate: string;
  itemsTotalCents: number;
  adjustmentCents: number;
  totalCents: number;
  notes: string | null;
  createdByUserId: string;
  createdAt: Date;
}

const COLUMNS = `
  id, "supplierId", "supplierName", to_char("purchaseDate", 'YYYY-MM-DD') AS "purchaseDate",
  "itemsTotalCents", "adjustmentCents", "totalCents", notes, "createdByUserId", "createdAt"
`;

export async function createPurchase(
  input: {
    supplierId: string | null;
    supplierName: string | null;
    purchaseDate: string;
    itemsTotalCents: number;
    adjustmentCents: number;
    totalCents: number;
    notes: string | null;
    createdByUserId: string;
  },
  db: Queryable = pool,
): Promise<PurchaseRecord> {
  const result = await db.query<PurchaseRecord>(
    `INSERT INTO purchases
      (id, "supplierId", "supplierName", "purchaseDate", "itemsTotalCents", "adjustmentCents", "totalCents", notes, "createdByUserId")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${COLUMNS}`,
    [
      createId(),
      input.supplierId,
      input.supplierName,
      input.purchaseDate,
      input.itemsTotalCents,
      input.adjustmentCents,
      input.totalCents,
      input.notes,
      input.createdByUserId,
    ],
  );
  return result.rows[0];
}

export interface PurchaseListRow extends PurchaseRecord {
  itemCount: number;
  expenseCount: number;
}

/** Compras mais recentes, com quantos itens e quantas despesas cada uma gerou. */
export async function listRecentPurchases(limit: number, db: Queryable = pool): Promise<PurchaseListRow[]> {
  const result = await db.query<PurchaseListRow>(
    `SELECT ${COLUMNS},
       (SELECT COUNT(*) FROM stock_movements sm WHERE sm."purchaseId" = purchases.id)::int AS "itemCount",
       (SELECT COUNT(*) FROM expenses e WHERE e."purchaseId" = purchases.id)::int AS "expenseCount"
     FROM purchases ORDER BY "purchaseDate" DESC, "createdAt" DESC LIMIT $1`,
    [limit],
  );
  return result.rows;
}
