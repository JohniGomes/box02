import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";

export type UserStatus = "ATIVO" | "INATIVO";

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const result = await pool.query<UserRecord>(
    `SELECT id, name, email, "passwordHash", status, "createdAt", "updatedAt"
     FROM users WHERE email = $1 LIMIT 1`,
    [email.toLowerCase().trim()],
  );
  return result.rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const result = await pool.query<UserRecord>(
    `SELECT id, name, email, "passwordHash", status, "createdAt", "updatedAt"
     FROM users WHERE id = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function createUser(input: {
  name: string;
  email: string;
  passwordHash: string;
}): Promise<UserRecord> {
  const id = createId();
  const result = await pool.query<UserRecord>(
    `INSERT INTO users (id, name, email, "passwordHash", status, "updatedAt")
     VALUES ($1, $2, $3, $4, 'ATIVO', NOW())
     RETURNING id, name, email, "passwordHash", status, "createdAt", "updatedAt"`,
    [id, input.name, input.email.toLowerCase().trim(), input.passwordHash],
  );
  return result.rows[0];
}

export async function assignRoleToUser(userId: string, roleId: string): Promise<void> {
  await pool.query(
    `INSERT INTO user_roles ("userId", "roleId") VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [userId, roleId],
  );
}

export async function getRoleNamesForUser(userId: string): Promise<string[]> {
  const result = await pool.query<{ name: string }>(
    `SELECT r.name FROM roles r
     INNER JOIN user_roles ur ON ur."roleId" = r.id
     WHERE ur."userId" = $1`,
    [userId],
  );
  return result.rows.map((r) => r.name);
}
