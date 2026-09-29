import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { createUser } from "@/lib/db/repositories/users";
import { hashPassword } from "@/lib/auth/password";
import { authenticateUser } from "../authenticate";

async function cleanDatabase() {
  await pool.query('TRUNCATE "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE');
}

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await pool.end();
});

describe("authenticateUser (fluxo real de login contra o banco)", () => {
  it("autentica com sucesso quando e-mail e senha estão corretos", async () => {
    const hash = await hashPassword("senhaCorreta123");
    await createUser({ name: "Mateus", email: "mateus@teste.com", passwordHash: hash });

    const result = await authenticateUser("mateus@teste.com", "senhaCorreta123");

    expect(result).not.toBeNull();
    expect(result?.name).toBe("Mateus");
  });

  it("rejeita quando a senha está incorreta", async () => {
    const hash = await hashPassword("senhaCorreta123");
    await createUser({ name: "Mateus", email: "mateus2@teste.com", passwordHash: hash });

    const result = await authenticateUser("mateus2@teste.com", "senhaErrada");

    expect(result).toBeNull();
  });

  it("rejeita quando o e-mail não existe (sem lançar erro, sem detalhar o motivo)", async () => {
    const result = await authenticateUser("naoexiste@teste.com", "qualquerSenha");
    expect(result).toBeNull();
  });

  it("grava um registro de auditoria a cada login bem-sucedido", async () => {
    const hash = await hashPassword("senhaCorreta123");
    const user = await createUser({ name: "Carlim", email: "carlim@teste.com", passwordHash: hash });

    await authenticateUser("carlim@teste.com", "senhaCorreta123");

    const logs = await pool.query(
      `SELECT action, "userId" FROM audit_logs WHERE "userId" = $1 AND action = 'LOGIN'`,
      [user.id],
    );
    expect(logs.rowCount).toBe(1);
  });

  it("não grava auditoria de login quando a senha está incorreta", async () => {
    const hash = await hashPassword("senhaCorreta123");
    const user = await createUser({ name: "Carlim", email: "carlim2@teste.com", passwordHash: hash });

    await authenticateUser("carlim2@teste.com", "senhaErrada");

    const logs = await pool.query(
      `SELECT action FROM audit_logs WHERE "userId" = $1 AND action = 'LOGIN'`,
      [user.id],
    );
    expect(logs.rowCount).toBe(0);
  });
});
