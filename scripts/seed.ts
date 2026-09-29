/**
 * Seed do Ciclo 1 — cria o papel ADMINISTRADOR e os dois usuários iniciais
 * (Carlim e Mateus).
 *
 * [PENDENTE] Vocês não informaram e-mails/senhas reais para Carlim e Mateus
 * ainda. Este script usa credenciais de PLACEHOLDER, claramente marcadas,
 * apenas para permitir testar o login agora. Antes de qualquer uso real,
 * troquem essas senhas (ou peçam para eu adicionar uma tela de "alterar
 * senha" — ainda não existe neste ciclo).
 *
 * Rodar com: npm run seed
 */
import "dotenv/config";
import { hashPassword } from "../src/lib/auth/password";
import { createUser, assignRoleToUser, findUserByEmail } from "../src/lib/db/repositories/users";
import { createRole, findRoleByName } from "../src/lib/db/repositories/roles";
import { recordAuditLog } from "../src/lib/db/repositories/auditLog";
import { pool } from "../src/lib/db/pool";

const PLACEHOLDER_USERS = [
  {
    name: "Carlim",
    email: "carlim@oficina-os.local",
    password: "trocar-senha-carlim-123",
  },
  {
    name: "Mateus",
    email: "mateus@oficina-os.local",
    password: "trocar-senha-mateus-123",
  },
];

async function main() {
  let role = await findRoleByName("ADMINISTRADOR");
  if (!role) {
    role = await createRole({
      name: "ADMINISTRADOR",
      description: "Acesso total ao sistema. Perfil inicial de Carlim e Mateus.",
    });
    console.log(`Papel criado: ${role.name}`);
  } else {
    console.log(`Papel já existia: ${role.name}`);
  }

  for (const u of PLACEHOLDER_USERS) {
    const existing = await findUserByEmail(u.email);
    if (existing) {
      console.log(`Usuário já existia, pulando: ${u.email}`);
      continue;
    }

    const passwordHash = await hashPassword(u.password);
    const user = await createUser({
      name: u.name,
      email: u.email,
      passwordHash,
    });
    await assignRoleToUser(user.id, role.id);
    await recordAuditLog({
      userId: user.id,
      action: "USER_CREATED_BY_SEED",
      entityType: "user",
      entityId: user.id,
    });

    console.log(`Usuário criado: ${u.name} <${u.email}> — senha placeholder: ${u.password}`);
  }

  console.log("\nSeed concluído.");
  console.log(
    "IMPORTANTE: as senhas acima são PLACEHOLDER para teste. Troquem antes de uso real.",
  );
}

main()
  .catch((err) => {
    console.error("Erro no seed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
