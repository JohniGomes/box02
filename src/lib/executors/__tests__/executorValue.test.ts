import { describe, expect, it } from "vitest";
import {
  defaultExecutorOptionId,
  executorTokens,
  joinNames,
  parseExecutorValue,
  sanitizeExecutorValue,
  selectedFromNames,
  toggleExecutorValue,
} from "../value";

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

describe("vários executores no mesmo item", () => {
  const opts = [
    { id: "executor:1", name: "Carlos Eduardo" },
    { id: "executor:2", name: "Mateus Cintra" },
    { id: "user_9", name: "Admin" },
  ];

  it("dois valores separados por vírgula viram uma lista de ids", () => {
    expect(parseExecutorValue("executor:1,executor:2")).toEqual({ executorIds: ["1", "2"] });
    expect(parseExecutorValue(" executor:1 , user_9 ")).toEqual({ executorIds: ["1", "user_9"] });
    expect(executorTokens("a,,b, ")).toEqual(["a", "b"]);
  });

  it("junta os nomes em português", () => {
    expect(joinNames(["A"])).toBe("A");
    expect(joinNames(["A", "B"])).toBe("A e B");
    expect(joinNames(["A", "B", "C"])).toBe("A, B e C");
    expect(joinNames([])).toBe("");
  });

  it("marca e desmarca mantendo a ordem da lista e nunca deixa vazio", () => {
    expect(toggleExecutorValue("executor:2", "executor:1", opts)).toBe("executor:1,executor:2");
    expect(toggleExecutorValue("executor:1,executor:2", "executor:1", opts)).toBe("executor:2");
    expect(toggleExecutorValue("executor:2", "executor:2", opts)).toBe("executor:2"); // o último não sai
  });

  it("descarta opção que não existe mais e volta ao padrão se não sobrar nada", () => {
    expect(sanitizeExecutorValue("executor:1,executor:99", opts, "executor:2")).toBe("executor:1");
    expect(sanitizeExecutorValue("executor:99", opts, "executor:2")).toBe("executor:2");
  });

  it("pré-marca pelos nomes ao corrigir um item", () => {
    expect(selectedFromNames(opts, "Carlos Eduardo e Mateus Cintra")).toBe("executor:1,executor:2");
    expect(selectedFromNames(opts, "mateus cintra")).toBe("executor:2");
    expect(selectedFromNames(opts, null)).toBe("");
    expect(selectedFromNames(opts, "Outra Pessoa")).toBe("");
  });
});
