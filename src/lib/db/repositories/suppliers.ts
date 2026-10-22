import type { Pool, PoolClient } from "pg";
import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";

type Queryable = Pool | PoolClient;

export interface SupplierRecord {
  id: string;
  name: string;
  status: "ATIVO" | "INATIVO";
  createdAt: Date;
}

const COLUMNS = `id, name, status, "createdAt"`;

export async function listSuppliers(onlyActive = false, db: Queryable = pool): Promise<SupplierRecord[]> {
  const result = await db.query<SupplierRecord>(
    `SELECT ${COLUMNS} FROM suppliers ${onlyActive ? "WHERE status = 'ATIVO'" : ""} ORDER BY lower(name) ASC`,
  );
  return result.rows;
}

export async function findSupplierById(id: string, db: Queryable = pool): Promise<SupplierRecord | null> {
  const result = await db.query<SupplierRecord>(`SELECT ${COLUMNS} FROM suppliers WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function findSupplierByName(name: string, db: Queryable = pool): Promise<SupplierRecord | null> {
  const result = await db.query<SupplierRecord>(
    `SELECT ${COLUMNS} FROM suppliers WHERE lower(btrim(name)) = lower(btrim($1)) LIMIT 1`,
    [name],
  );
  return result.rows[0] ?? null;
}

export async function createSupplier(name: string, db: Queryable = pool): Promise<SupplierRecord> {
  const result = await db.query<SupplierRecord>(
    `INSERT INTO suppliers (id, name) VALUES ($1, $2) RETURNING ${COLUMNS}`,
    [createId(), name],
  );
  return result.rows[0];
}

export async function setSupplierStatus(
  id: string,
  status: "ATIVO" | "INATIVO",
  db: Queryable = pool,
): Promise<SupplierRecord | null> {
  const result = await db.query<SupplierRecord>(
    `UPDATE suppliers SET status = $2 WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, status],
  );
  return result.rows[0] ?? null;
}
