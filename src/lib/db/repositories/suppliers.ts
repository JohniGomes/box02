import type { Pool, PoolClient } from "pg";
import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";

type Queryable = Pool | PoolClient;

export interface SupplierRecord {
  id: string;
  name: string;
  /** Só dígitos (DDD + número); opcional. */
  phone: string | null;
  notes: string | null;
  status: "ATIVO" | "INATIVO";
  createdAt: Date;
}

const COLUMNS = `id, name, phone, notes, status, "createdAt"`;

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

export async function createSupplier(
  name: string,
  db: Queryable = pool,
  extra: { phone?: string | null; notes?: string | null } = {},
): Promise<SupplierRecord> {
  const result = await db.query<SupplierRecord>(
    `INSERT INTO suppliers (id, name, phone, notes) VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
    [createId(), name, extra.phone ?? null, extra.notes ?? null],
  );
  return result.rows[0];
}

export async function updateSupplier(
  id: string,
  input: { name: string; phone: string | null; notes: string | null },
  db: Queryable = pool,
): Promise<SupplierRecord | null> {
  const result = await db.query<SupplierRecord>(
    `UPDATE suppliers SET name = $2, phone = $3, notes = $4 WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, input.name, input.phone, input.notes],
  );
  return result.rows[0] ?? null;
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
