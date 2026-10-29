import { GoogleGenAI } from "@google/genai";
import { cleanApiKey, geminiModelCandidates } from "./config";
import { GeminiUnavailableError } from "./errors";
import { isModelNotFound } from "./client";

/**
 * Consulta ao Gemini COM pesquisa do Google. Os links das fontes vêm dos metadados reais da
 * pesquisa (groundingMetadata), nunca do texto escrito pelo modelo, e só aceitamos http/https.
 */

export interface GroundedSource {
  uri: string;
  title: string;
}

/** Trecho da resposta (em bytes UTF-8) apoiado por uma ou mais fontes. */
export interface GroundedSupport {
  start: number;
  end: number;
  chunkIndices: number[];
}

export interface GroundedResult {
  text: string;
  /** Alinhado aos índices dos metadados; null = fonte descartada (link inválido). */
  chunks: (GroundedSource | null)[];
  supports: GroundedSupport[];
}

export type GroundedRunner = (model: string, prompt: string) => Promise<GroundedResult>;

interface MetadataLike {
  groundingChunks?: { web?: { uri?: string; title?: string } }[];
  groundingSupports?: { groundingChunkIndices?: number[]; segment?: { startIndex?: number; endIndex?: number } }[];
}

function isSafeWebUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Converte os metadados da pesquisa no formato simples que usamos. Função pura. */
export function normalizeGrounding(meta: MetadataLike | null | undefined): Pick<GroundedResult, "chunks" | "supports"> {
  const chunks = (meta?.groundingChunks ?? []).map((c) => {
    const uri = c.web?.uri;
    if (!isSafeWebUrl(uri)) return null;
    return { uri, title: (c.web?.title ?? "").trim() || new URL(uri).hostname };
  });
  const supports = (meta?.groundingSupports ?? [])
    .map((s) => ({
      start: s.segment?.startIndex ?? 0,
      end: s.segment?.endIndex ?? 0,
      chunkIndices: s.groundingChunkIndices ?? [],
    }))
    .filter((s) => s.end > s.start && s.chunkIndices.length > 0);
  return { chunks, supports };
}

const defaultRunner: GroundedRunner = async (model, prompt) => {
  const key = cleanApiKey(process.env.GEMINI_API_KEY);
  if (!key) throw new GeminiUnavailableError("no_key");
  const ai = new GoogleGenAI({ apiKey: key });
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    // A pesquisa do Google não funciona junto de "responder só em JSON": o JSON é pedido no texto e validado depois.
    config: { tools: [{ googleSearch: {} }] },
  });
  const meta = response.candidates?.[0]?.groundingMetadata;
  return { text: response.text ?? "", ...normalizeGrounding(meta) };
};

/** Pergunta ao Gemini com pesquisa na web, tentando o modelo seguinte se o primeiro não existir mais. */
export async function generateGrounded(
  prompt: string,
  opts: { runner?: GroundedRunner; models?: string[] } = {},
): Promise<GroundedResult> {
  const runner = opts.runner ?? defaultRunner;
  const models = opts.models ?? geminiModelCandidates(process.env.GEMINI_MODEL);
  let lastError: unknown;
  for (const model of models) {
    try {
      return await runner(model, prompt);
    } catch (err) {
      if (err instanceof GeminiUnavailableError) throw err;
      lastError = err;
      console.error(`[gemini] falha (com pesquisa) no modelo ${model}:`, err instanceof Error ? err.message : err);
      if (!isModelNotFound(err)) throw new GeminiUnavailableError("request_failed", err);
    }
  }
  throw new GeminiUnavailableError("model_missing", lastError);
}
