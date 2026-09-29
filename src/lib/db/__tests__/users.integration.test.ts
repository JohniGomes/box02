import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "../pool";
import {
  assignRoleToUser,
  createUser,
  findUserByEmail,
  getRoleNamesForUser,
} from "../repositories/users";
import { createRole, findRoleByName } from "../repositories/roles";
import { hashPassword } from "@/lib/auth/password";

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

describe("repositório de usuários e papéis", () => {
  it("cria um usuário e recupera por e-mail", async () => {
    const hash = await hashPassword("senhaValida123");
    const created = await createUser({
      name: "Teste da Silva",
      email: "Teste@Exemplo.com", // propositalmente com maiúsculas
      passwordHash: hash,
    });

    expect(created.id).toBeTruthy();
    expect(created.status).toBe("ATIVO");

    const found = await findUserByEmail("teste@exemplo.com");
    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
  });

  it("não permite dois usuários com o mesmo e-mail", async () => {
    const hash = await hashPassword("senhaValida123");
    await createUser({ name: "A", email: "duplicado@exemplo.com", passwordHash: hash });

    await expect(
      createUser({ name: "B", email: "duplicado@exemplo.com", passwordHash: hash }),
    ).rejects.toThrow();
  });

  it("associa um papel a um usuário e recupera os nomes dos papéis", async () => {
    const hash = await hashPassword("senhaValida123");
    const user = await createUser({ name: "Carlim", email: "carlim@teste.com", passwordHash: hash });
    const role = await createRole({ name: "ADMINISTRADOR", description: "Acesso total" });

    await assignRoleToUser(user.id, role.id);

    const roles = await getRoleNamesForUser(user.id);
    expect(roles).toEqual(["ADMINISTRADOR"]);
  });

  it("findRoleByName retorna null quando o papel não existe", async () => {
    const role = await findRoleByName("INEXISTENTE");
    expect(role).toBeNull();
  });
});
