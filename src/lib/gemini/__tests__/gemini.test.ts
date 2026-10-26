import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { cleanApiKey, geminiModelCandidates } from "../config";
import { generateText, isModelNotFound } from "../client";
import { extractJsonText, generateJson } from "../json";
import { extractFromText } from "../extract";
import { GEMINI_FRIENDLY_MESSAGE, GeminiBadResponseError, GeminiUnavailableError, friendlyAiMessage } from "../errors";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("chave e modelos", () => {
  it("remove o caractere invisível (BOM 65279), espaços, quebras e aspas da chave", () => {
    expect(cleanApiKey("﻿AQ.abc123")).toBe("AQ.abc123");
    expect(cleanApiKey('  "AQ.abc123"\n')).toBe("AQ.abc123");
    expect(cleanApiKey("AQ.​abc 123")).toBe("AQ.abc123");
    expect(cleanApiKey(undefined)).toBe("");
  });

  it("o modelo pedido vai primeiro, sem repetir os padrões", () => {
    expect(geminiModelCandidates("﻿gemini-3-flash")[0]).toBe("gemini-3-flash");
    expect(geminiModelCandidates("gemini-2.5-flash")).toEqual(["gemini-2.5-flash", "gemini-2.0-flash"]);
    expect(geminiModelCandidates(undefined)).toEqual(["gemini-2.5-flash", "gemini-2.0-flash"]);
  });
});

describe("tentar o próximo modelo e nunca mostrar erro técnico", () => {
  it("modelo inexistente passa para o próximo", async () => {
    const calls: string[] = [];
    const text = await generateText("oi", {
      models: ["velho", "novo"],
      runner: async (model) => {
        calls.push(model);
        if (model === "velho") throw new Error("[404 Not Found] models/velho is not found");
        return "ok";
      },
    });
    expect(text).toBe("ok");
    expect(calls).toEqual(["velho", "novo"]);
  });

  it("outro erro (rede, cota) vira GeminiUnavailableError sem trocar de modelo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const runner = vi.fn(async () => {
      throw new Error("fetch failed: ECONNRESET");
    });
    await expect(generateText("oi", { models: ["a", "b"], runner })).rejects.toMatchObject({ reason: "request_failed" });
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("todos os modelos inexistentes: model_missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      generateText("oi", { models: ["a", "b"], runner: async () => { throw new Error("404 not found"); } }),
    ).rejects.toMatchObject({ reason: "model_missing" });
  });

  it("sem chave: erro amigável só na hora de usar (importar o arquivo não quebra)", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(generateText("oi", { models: ["a"] })).rejects.toBeInstanceOf(GeminiUnavailableError);
    await expect(generateText("oi", { models: ["a"] })).rejects.toMatchObject({ reason: "no_key", message: GEMINI_FRIENDLY_MESSAGE });
  });

  it("a mensagem para a pessoa nunca traz o texto técnico", () => {
    expect(friendlyAiMessage(new Error("Cannot convert argument to a ByteString because the character at index 0 has a value of 65279"))).toBe(
      GEMINI_FRIENDLY_MESSAGE,
    );
    expect(friendlyAiMessage(new GeminiBadResponseError())).toMatch(/não entendeu/);
    expect(isModelNotFound(new Error("something else"))).toBe(false);
  });
});

describe("JSON do Gemini validado", () => {
  it("tira cercas de markdown e texto ao redor", () => {
    expect(extractJsonText('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJsonText('Claro! Aqui está: {"a":1} espero ter ajudado')).toBe('{"a":1}');
  });

  it("devolve o dado válido e recusa JSON torto ou fora do formato", async () => {
    const schema = z.object({ n: z.number() });
    await expect(generateJson("x", schema, { models: ["m"], runner: async () => '```json\n{"n": 3}\n```' })).resolves.toEqual({ n: 3 });
    await expect(generateJson("x", schema, { models: ["m"], runner: async () => "não é json" })).rejects.toBeInstanceOf(GeminiBadResponseError);
    await expect(generateJson("x", schema, { models: ["m"], runner: async () => '{"n":"tres"}' })).rejects.toBeInstanceOf(GeminiBadResponseError);
  });
});

describe("assistente de lançamento sobre a camada nova", () => {
  it("normaliza a resposta bagunçada da IA (números em texto, nulos, tipo estranho)", async () => {
    const messy = '```json\n' + JSON.stringify({
      cliente: { nome: "Maria da Silva", telefone: "(62) 99999-8888", documento: null },
      veiculo: { marca: "Fiat", modelo: "Palio", ano: "2015", placa: "ABC-1234", cor: null, quilometragem: "98.000" },
      itens: [
        { tipo: "PECA", descricao: "Filtro de óleo", quantidade: "2", precoUnitarioCentavos: "4500" },
        { tipo: "QUALQUER", descricao: "Lavagem", quantidade: null, precoUnitarioCentavos: null },
        { tipo: "SERVICO", descricao: "  ", quantidade: 1, precoUnitarioCentavos: 100 },
      ],
      observacoes: null,
      confianca: "MUITO ALTA",
    }) + '\n```';
    const out = await extractFromText("texto qualquer", { models: ["m"], runner: async () => messy });
    expect(out.cliente).toEqual({ nome: "Maria da Silva", telefone: "(62) 99999-8888", documento: undefined });
    expect(out.veiculo).toMatchObject({ marca: "Fiat", modelo: "Palio", ano: 2015, quilometragem: 98000 });
    expect(out.itens).toEqual([
      { tipo: "PECA", descricao: "Filtro de óleo", quantidade: 2, precoUnitarioCentavos: 4500 },
      { tipo: "OUTRO", descricao: "Lavagem", quantidade: 1, precoUnitarioCentavos: null },
    ]);
    expect(out.observacoes).toBe("");
    expect(out.confianca).toBe("BAIXA");
    expect(out.textoOriginal).toBe("texto qualquer");
  });
});
