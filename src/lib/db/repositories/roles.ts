import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";

export interface RoleRecord {
  id: string;
  name: string;
  description: string | null;
}

export async function findRoleByName(name: string): Promise<RoleRecord | null> {
  const result = await pool.query<RoleRecord>(
    `SELECT id, name, description FROM roles WHERE name = $1 LIMIT 1`,
    [name],
  );
  return result.rows[0] ?? null;
}

export async function createRole(input: {
  name: string;
  description?: string;
}): Promise<RoleRecord> {
  const id = createId();
  const result = await pool.query<RoleRecord>(
    `INSERT INTO roles (id, name, description, "updatedAt")
     VALUES ($1, $2, $3, NOW())
     RETURNING id, name, description`,
    [id, input.name, input.description ?? null],
  );
  return result.rows[0];
}
