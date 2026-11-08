import { beforeEach, describe, expect, it, vi } from "vitest";

// Teste de unidade: o pool é simulado, nenhuma conexão com banco é aberta.
vi.mock("@/lib/db/pool", () => ({ pool: { query: vi.fn() } }));

import { pool } from "@/lib/db/pool";
import { recordAuditLog } from "@/lib/db/repositories/auditLog";

const query = pool.query as unknown as ReturnType<typeof vi.fn>;

function fkError(constraint: string) {
  return Object.assign(new Error("violates foreign key constraint"), {
    code: "23503",
    constraint,
  });
}

describe("recordAuditLog", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("grava normalmente, com o usuário, em uma única chamada", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await recordAuditLog({ userId: "u1", action: "X", entityType: "t", entityId: "e1", metadata: { a: 1 } });
    expect(query).toHaveBeenCalledTimes(1);
    const params = query.mock.calls[0][1] as unknown[];
    expect(params[1]).toBe("u1");
    expect(JSON.parse(params[5] as string)).toEqual({ a: 1 });
  });

  it("se o usuário não existe mais, grava sem usuário e guarda o id original nos detalhes", async () => {
    query.mockRejectedValueOnce(fkError("audit_logs_userId_fkey")).mockResolvedValueOnce({ rows: [] });
    await expect(
      recordAuditLog({ userId: "u-antigo", action: "X", entityType: "t", entityId: "e1", metadata: { a: 1 } }),
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(2);
    const retry = query.mock.calls[1][1] as unknown[];
    expect(retry[1]).toBeNull();
    expect(JSON.parse(retry[5] as string)).toEqual({ a: 1, userIdNaoEncontrado: "u-antigo" });
  });

  it("guarda o id original mesmo quando não havia detalhes", async () => {
    query.mockRejectedValueOnce(fkError("audit_logs_userId_fkey")).mockResolvedValueOnce({ rows: [] });
    await recordAuditLog({ userId: "u-antigo", action: "X", entityType: "t" });
    const retry = query.mock.calls[1][1] as unknown[];
    expect(JSON.parse(retry[5] as string)).toEqual({ userIdNaoEncontrado: "u-antigo" });
  });

  it("não esconde outros erros do banco", async () => {
    query.mockRejectedValueOnce(new Error("connection terminated"));
    await expect(recordAuditLog({ userId: "u1", action: "X", entityType: "t" })).rejects.toThrow("connection terminated");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("não esconde violação de outra chave estrangeira", async () => {
    query.mockRejectedValueOnce(fkError("outra_fkey"));
    await expect(recordAuditLog({ userId: "u1", action: "X", entityType: "t" })).rejects.toThrow();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("sem usuário informado, um erro de chave estrangeira não é refeito", async () => {
    query.mockRejectedValueOnce(fkError("audit_logs_userId_fkey"));
    await expect(recordAuditLog({ action: "X", entityType: "t" })).rejects.toThrow();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("se a segunda tentativa também falhar, o erro aparece", async () => {
    query.mockRejectedValueOnce(fkError("audit_logs_userId_fkey")).mockRejectedValueOnce(new Error("disco cheio"));
    await expect(recordAuditLog({ userId: "u1", action: "X", entityType: "t" })).rejects.toThrow("disco cheio");
    expect(query).toHaveBeenCalledTimes(2);
  });
});
