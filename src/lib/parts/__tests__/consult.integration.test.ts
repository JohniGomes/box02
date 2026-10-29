import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { normalizeGrounding, type GroundedResult, type GroundedRunner } from "@/lib/gemini/grounded";
import { GeminiBadResponseError } from "@/lib/gemini/errors";
import { buildPartCodeResults, consultPartsService, evaluateCodeSupport, partsCacheKey } from "../consult";

let actorUserId: string;

beforeAll(async () => {
  await pool.query(`TRUNCATE "part_consults", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`);
  actorUserId = (await createUser({ name: "Testador", email: "cp@teste.com", passwordHash: await hashPassword("senhaTeste123") })).id;
});

afterAll(async () => {
  await pool.query(`TRUNCATE "part_consults", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`);
  await pool.end();
});

/** Resposta simulada do Gemini com pesquisa: o código SYL-123 tem 2 fontes, o BS-9 tem 1, o XX-0 nenhuma. */
function fakeGrounded(): GroundedResult {
  const text =
    '{"resultados":[' +
    '{"marca":"Fras-le","codigo":"SYL-123","descricao":"Pastilha de freio dianteira","aplicacao":"Gol 2015 1.0 — peça única"},' +
    '{"marca":"Bosch","codigo":"BS-9","descricao":"Pastilha","aplicacao":"Gol 2015"},' +
    '{"marca":"Cofap","codigo":"XX-0","descricao":"Pastilha","aplicacao":""}]}';
  const bytes = (needle: string) => {
    const idx = text.indexOf(needle);
    const start = Buffer.byteLength(text.slice(0, idx));
    return { start, end: start + Buffer.byteLength(needle) };
  };
  const syl = bytes("SYL-123");
  const bs = bytes("BS-9");
  return {
    text,
    chunks: [
      { uri: "https://loja.exemplo/pastilha", title: "loja.exemplo" },
      { uri: "https://catalogo.exemplo/gol", title: "catalogo.exemplo" },
      null,
    ],
    supports: [
      { start: syl.start, end: syl.end, chunkIndices: [0, 1] },
      { start: bs.start, end: bs.end, chunkIndices: [1] },
    ],
  };
}

describe("fontes reais e confiança calculada pelo servidor", () => {
  it("só aceita links http/https dos metadados e mantém o alinhamento dos índices", () => {
    const n = normalizeGrounding({
      groundingChunks: [
        { web: { uri: "https://a.exemplo/x", title: "A" } },
        { web: { uri: "javascript:alert(1)", title: "ruim" } },
        { web: { uri: "http://b.exemplo/y" } },
        {},
      ],
      groundingSupports: [{ groundingChunkIndices: [0], segment: { startIndex: 5, endIndex: 12 } }, { groundingChunkIndices: [], segment: { startIndex: 0, endIndex: 3 } }],
    });
    expect(n.chunks).toEqual([{ uri: "https://a.exemplo/x", title: "A" }, null, { uri: "http://b.exemplo/y", title: "b.exemplo" }, null]);
    expect(n.supports).toEqual([{ start: 5, end: 12, chunkIndices: [0] }]);
  });

  it("ALTA com 2 fontes distintas, MÉDIA com 1, BAIXA sem nenhuma", () => {
    const g = fakeGrounded();
    expect(evaluateCodeSupport("SYL-123", g)).toMatchObject({ confianca: "ALTA" });
    expect(evaluateCodeSupport("SYL-123", g).fontes.map((f) => f.title)).toEqual(["loja.exemplo", "catalogo.exemplo"]);
    expect(evaluateCodeSupport("BS-9", g)).toMatchObject({ confianca: "MEDIA" });
    expect(evaluateCodeSupport("XX-0", g)).toEqual({ confianca: "BAIXA", fontes: [] });
  });

  it("acentos antes do código não desalinham a conferência (posição em bytes)", () => {
    const text = 'Aplicação ção ç {"codigo":"ABC-1"}';
    const idx = text.indexOf("ABC-1");
    const start = Buffer.byteLength(text.slice(0, idx));
    const g = { text, chunks: [{ uri: "https://x.exemplo", title: "x" }, { uri: "https://y.exemplo", title: "y" }], supports: [{ start, end: start + 5, chunkIndices: [0, 1] }] };
    expect(evaluateCodeSupport("ABC-1", g).confianca).toBe("ALTA");
  });

  it("monta os resultados ordenados por confiança, sem repetir, e recusa resposta que não é JSON", () => {
    const results = buildPartCodeResults(fakeGrounded());
    expect(results.map((r) => `${r.marca}:${r.confianca}`)).toEqual(["Fras-le:ALTA", "Bosch:MEDIA", "Cofap:BAIXA"]);
    expect(() => buildPartCodeResults({ text: "não sei", chunks: [], supports: [] })).toThrow(GeminiBadResponseError);
  });
});

describe("consulta com cache de 30 dias", () => {
  const input = { marca: "Volkswagen", modelo: "Gol", ano: "2015", versao: "1.0 flex", peca: "pastilha de freio dianteira" };

  it("guarda a consulta, reaproveita nas próximas (mesmo com maiúsculas/espaços diferentes) e renova no 'consultar de novo'", async () => {
    const runner: GroundedRunner = vi.fn(async () => fakeGrounded());
    const first = await consultPartsService(actorUserId, input, { runner, models: ["m"] });
    expect(first.fromCache).toBe(false);
    expect(first.resultados).toHaveLength(3);
    expect(first.aviso).toMatch(/Confirme o código/);

    const second = await consultPartsService(actorUserId, { ...input, marca: "  VOLKSWAGEN ", peca: "Pastilha  de freio dianteira" }, { runner, models: ["m"] });
    expect(second.fromCache).toBe(true);
    expect(second.resultados).toEqual(first.resultados);
    expect(runner).toHaveBeenCalledTimes(1);

    const third = await consultPartsService(actorUserId, input, { runner, models: ["m"], refresh: true });
    expect(third.fromCache).toBe(false);
    expect(runner).toHaveBeenCalledTimes(2);
    expect(partsCacheKey(input)).toBe("volkswagen|gol|1.0 flex|2015|pastilha de freio dianteira");
  });

  it("resposta torta da IA não é guardada no cache", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const bad: GroundedRunner = async () => ({ text: "desculpe, não consegui", chunks: [], supports: [] });
    await expect(consultPartsService(actorUserId, { ...input, peca: "correia dentada" }, { runner: bad, models: ["m"] })).rejects.toBeInstanceOf(GeminiBadResponseError);
    const cached = await pool.query(`SELECT count(*)::int AS n FROM part_consults WHERE "partLabel" = 'correia dentada'`);
    expect(cached.rows[0].n).toBe(0);
  });
});
