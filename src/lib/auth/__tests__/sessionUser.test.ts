import { describe, expect, it, vi } from "vitest";
import { isSessionUserValid } from "@/lib/auth/sessionUser";

describe("isSessionUserValid", () => {
  it("aceita usuário ativo que existe no banco", async () => {
    const lookup = vi.fn().mockResolvedValue({ status: "ATIVO" });
    await expect(isSessionUserValid("u1", lookup)).resolves.toBe(true);
    expect(lookup).toHaveBeenCalledWith("u1");
  });

  it("recusa quando o usuário não existe mais no banco", async () => {
    const lookup = vi.fn().mockResolvedValue(null);
    await expect(isSessionUserValid("u-antigo", lookup)).resolves.toBe(false);
  });

  it("recusa usuário inativado", async () => {
    const lookup = vi.fn().mockResolvedValue({ status: "INATIVO" });
    await expect(isSessionUserValid("u1", lookup)).resolves.toBe(false);
  });

  it("recusa sessão sem id e nem consulta o banco", async () => {
    const lookup = vi.fn();
    await expect(isSessionUserValid(undefined, lookup)).resolves.toBe(false);
    await expect(isSessionUserValid(null, lookup)).resolves.toBe(false);
    await expect(isSessionUserValid("", lookup)).resolves.toBe(false);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("mantém a sessão se a consulta ao banco falhar (queda momentânea não desloga todo mundo)", async () => {
    const lookup = vi.fn().mockRejectedValue(new Error("connection terminated"));
    await expect(isSessionUserValid("u1", lookup)).resolves.toBe(true);
  });
});
