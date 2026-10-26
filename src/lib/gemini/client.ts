import { GoogleGenerativeAI, type GenerateContentRequest } from "@google/generative-ai";
import { cleanApiKey, geminiModelCandidates } from "./config";
import { GeminiUnavailableError } from "./errors";

/**
 * Cliente do Gemini criado só na hora de usar. Antes ele era criado ao importar o arquivo e
 * lançava erro se a chave faltasse — o que derrubava QUALQUER tela que importasse o assistente
 * (até gravações simples). Agora a falta de chave só afeta quem pede algo à IA.
 */
let cached: { key: string; client: GoogleGenerativeAI } | null = null;

export function getGeminiClient(): GoogleGenerativeAI {
  const key = cleanApiKey(process.env.GEMINI_API_KEY);
  if (!key) throw new GeminiUnavailableError("no_key");
  if (!cached || cached.key !== key) cached = { key, client: new GoogleGenerativeAI(key) };
  return cached.client;
}

export type GeminiRequest = string | GenerateContentRequest;

/** Executa um pedido num modelo e devolve o texto. Injetável nos testes. */
export type GeminiRunner = (model: string, request: GeminiRequest) => Promise<string>;

const defaultRunner: GeminiRunner = async (model, request) => {
  const result = await getGeminiClient().getGenerativeModel({ model }).generateContent(request);
  return result.response.text();
};

/** Erro de "modelo não existe / não disponível para esta chave". */
export function isModelNotFound(err: unknown): boolean {
  const text = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /\b404\b|not found|is not supported|no longer available|NOT_FOUND/i.test(text);
}

/**
 * Pede texto ao Gemini com os modelos em ordem de preferência. Nunca devolve erro técnico para
 * a tela: tudo vira GeminiUnavailableError (o detalhe fica só no log do servidor).
 */
export async function generateText(
  request: GeminiRequest,
  opts: { runner?: GeminiRunner; models?: string[] } = {},
): Promise<string> {
  const runner = opts.runner ?? defaultRunner;
  const models = opts.models ?? geminiModelCandidates(process.env.GEMINI_MODEL);
  let lastError: unknown;

  for (const model of models) {
    try {
      return await runner(model, request);
    } catch (err) {
      if (err instanceof GeminiUnavailableError) throw err;
      lastError = err;
      console.error(`[gemini] falha no modelo ${model}:`, err instanceof Error ? err.message : err);
      if (!isModelNotFound(err)) throw new GeminiUnavailableError("request_failed", err);
    }
  }
  throw new GeminiUnavailableError("model_missing", lastError);
}
