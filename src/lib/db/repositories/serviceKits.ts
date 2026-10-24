import type { Pool, PoolClient } from "pg";
import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";

type Queryable = Pool | PoolClient;

export interface ServiceKitItemRecord {
  id: string;
  serviceId: string;
  type: "PECA" | "MAO_DE_OBRA";
  description: string;
  quantity: string; // NUMERIC vem como string do pg
  partId: string | null;
  unitPriceCents: number | null;
  sortOrder: number;
}

const COLUMNS = `id, "serviceId", type, description, quantity, "partId", "unitPriceCents", "sortOrder"`;

export async function listKitItems(serviceId: string, db: Queryable = pool): Promise<ServiceKitItemRecord[]> {
  const result = await db.query<ServiceKitItemRecord>(
    `SELECT ${COLUMNS} FROM service_kit_items WHERE "serviceId" = $1 ORDER BY "sortOrder" ASC, "createdAt" ASC`,
    [serviceId],
  );
  return result.rows;
}

export async function deleteKitItems(serviceId: string, db: Queryable = pool): Promise<void> {
  await db.query(`DELETE FROM service_kit_items WHERE "serviceId" = $1`, [serviceId]);
}

export async function insertKitItems(
  serviceId: string,
  items: { type: "PECA" | "MAO_DE_OBRA"; description: string; quantity: number; partId: string | null; unitPriceCents: number | null }[],
  db: Queryable = pool,
): Promise<void> {
  let order = 0;
  for (const item of items) {
    await db.query(
      `INSERT INTO service_kit_items (id, "serviceId", type, description, quantity, "partId", "unitPriceCents", "sortOrder")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [createId(), serviceId, item.type, item.description, item.quantity, item.partId, item.unitPriceCents, order++],
    );
  }
}
