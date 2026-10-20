import { describe, expect, it } from "vitest";
import { defaultExecutorOptionId, parseExecutorValue } from "../value";

// Só funções puras: este arquivo NÃO toca no banco.
describe("parseExecutorValue", () => {
  it("valor com prefixo vira executorId", () => {
    expect(parseExecutorValue("executor:abc123")).toEqual({ executorId: "abc123" });
  });

  it("valor sem prefixo é um usuário", () => {
    expect(parseExecutorValue("user_9")).toEqual({ executedByUserId: "user_9" });
  });

  it("ignora espaços nas pontas", () => {
    expect(parseExecutorValue("  executor:x  ")).toEqual({ executorId: "x" });
  });
});

describe("defaultExecutorOptionId", () => {
  const opts = [
    { id: "executor:1", name: "Mateus Cintra" },
    { id: "executor:2", name: "Carlos Eduardo" },
  ];

  it("usa a primeira opção quando o usuário logado não está na lista", () => {
    expect(defaultExecutorOptionId(opts, "user_9")).toBe("executor:1");
  });

  it("usa o usuário logado quando ele está na lista", () => {
    expect(defaultExecutorOptionId([{ id: "user_9", name: "Admin" }, ...opts], "user_9")).toBe("user_9");
  });

  it("lista vazia dá valor vazio", () => {
    expect(defaultExecutorOptionId([], "user_9")).toBe("");
  });
});
