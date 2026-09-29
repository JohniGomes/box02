import { findUserByEmail, getRoleNamesForUser } from "@/lib/db/repositories/users";
import { verifyPassword } from "@/lib/auth/password";
import { recordAuditLog } from "@/lib/db/repositories/auditLog";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  roles: string[];
}

/**
 * Valida e-mail e senha contra o banco. Retorna `null` para qualquer
 * motivo de falha (usuário inexistente, inativo ou senha incorreta) —
 * deliberadamente sem diferenciar o motivo, para não revelar se um
 * e-mail está cadastrado (critério de aceite do Ciclo 1).
 */
export async function authenticateUser(
  email: string,
  password: string,
): Promise<AuthenticatedUser | null> {
  const user = await findUserByEmail(email);
  if (!user || user.status !== "ATIVO") return null;

  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) return null;

  const roles = await getRoleNamesForUser(user.id);

  await recordAuditLog({
    userId: user.id,
    action: "LOGIN",
    entityType: "user",
    entityId: user.id,
  });

  return { id: user.id, name: user.name, email: user.email, roles };
}
