import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../password";

describe("hashPassword / verifyPassword", () => {
  it("nunca retorna a senha em texto puro como hash", async () => {
    const hash = await hashPassword("minhaSenhaForte123");
    expect(hash).not.toBe("minhaSenhaForte123");
    expect(hash.length).toBeGreaterThan(20);
  });

  it("aceita a senha correta", async () => {
    const hash = await hashPassword("minhaSenhaForte123");
    const ok = await verifyPassword("minhaSenhaForte123", hash);
    expect(ok).toBe(true);
  });

  it("rejeita senha incorreta", async () => {
    const hash = await hashPassword("minhaSenhaForte123");
    const ok = await verifyPassword("senhaErrada", hash);
    expect(ok).toBe(false);
  });

  it("rejeita senha vazia na verificação", async () => {
    const hash = await hashPassword("minhaSenhaForte123");
    const ok = await verifyPassword("", hash);
    expect(ok).toBe(false);
  });

  it("recusa gerar hash de senha muito curta (menos de 8 caracteres)", async () => {
    await expect(hashPassword("123")).rejects.toThrow();
  });

  it("dois hashes da mesma senha são diferentes entre si (salt aleatório)", async () => {
    const hash1 = await hashPassword("mesmaSenha123");
    const hash2 = await hashPassword("mesmaSenha123");
    expect(hash1).not.toBe(hash2);
  });
});
