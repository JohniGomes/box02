import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

/** Gera o hash de uma senha em texto puro. Nunca armazenar a senha original. */
export async function hashPassword(plainPassword: string): Promise<string> {
  if (!plainPassword || plainPassword.length < 8) {
    throw new Error("A senha deve ter pelo menos 8 caracteres.");
  }
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

/** Compara uma senha em texto puro com o hash armazenado. */
export async function verifyPassword(
  plainPassword: string,
  passwordHash: string,
): Promise<boolean> {
  if (!plainPassword || !passwordHash) return false;
  return bcrypt.compare(plainPassword, passwordHash);
}
