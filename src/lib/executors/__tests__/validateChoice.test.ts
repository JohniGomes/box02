import { describe, expect, it } from "vitest";
import { assertExecutorChoiceValid } from "@/lib/executors/validateChoice";

class Invalido extends Error {}

type Row = { status: string } | null;
function lookups(executors: Record<string, Row>, users: Record<string, Row> = {}) {
  return {
    executor: async (id: string) => executors[id] ?? null,
    user: async (id: string) => users[id] ?? null,
  };
}
const fail = () => new Invalido("executor inválido");

describe("assertExecutorChoiceValid", () => {
  const exec = lookups({ c1: { status: "ATIVO" }, m1: { status: "ATIVO" }, velho: { status: "INATIVO" } }, { u1: { status: "ATIVO" }, u2: { status: "INATIVO" } });

  it("um executor da lista, ativo", async () => {
    await expect(assertExecutorChoiceValid("executor:c1", exec, fail)).resolves.toBeUndefined();
  });

  it("um executor da lista inativo ou inexistente é recusado", async () => {
    await expect(assertExecutorChoiceValid("executor:velho", exec, fail)).rejects.toBeInstanceOf(Invalido);
    await expect(assertExecutorChoiceValid("executor:nao-existe", exec, fail)).rejects.toBeInstanceOf(Invalido);
  });

  it("um usuário ativo", async () => {
    await expect(assertExecutorChoiceValid("u1", exec, fail)).resolves.toBeUndefined();
  });

  it("usuário inativo, inexistente ou valor vazio é recusado", async () => {
    await expect(assertExecutorChoiceValid("u2", exec, fail)).rejects.toBeInstanceOf(Invalido);
    await expect(assertExecutorChoiceValid("u-nao-existe", exec, fail)).rejects.toBeInstanceOf(Invalido);
    await expect(assertExecutorChoiceValid("", exec, fail)).rejects.toBeInstanceOf(Invalido);
  });

  it("dois executores marcados juntos, todos ativos", async () => {
    await expect(assertExecutorChoiceValid("executor:c1,executor:m1", exec, fail)).resolves.toBeUndefined();
  });

  it("se um dos marcados for inativo ou não existir, recusa tudo", async () => {
    await expect(assertExecutorChoiceValid("executor:c1,executor:velho", exec, fail)).rejects.toBeInstanceOf(Invalido);
    await expect(assertExecutorChoiceValid("executor:c1,executor:nao-existe", exec, fail)).rejects.toBeInstanceOf(Invalido);
  });

  it("na lista de vários, um usuário ativo também vale (igual à marcação de itens da OS)", async () => {
    await expect(assertExecutorChoiceValid("executor:c1,u1", exec, fail)).resolves.toBeUndefined();
  });
});
