import type { z } from "zod";
import { generateText, type GeminiRequest, type GeminiRunner } from "./client";
import { GeminiBadResponseError } from "./errors";

/** Tira cercas de markdown (```json) e o texto ao redor, deixando só o JSON. */
export function extractJsonText(text: string): string {
  const unfenced = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const firstObject = unfenced.indexOf("{");
  const firstArray = unfenced.indexOf("[");
  const start = [firstObject, firstArray].filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (start === undefined) return unfenced;
  const end = Math.max(unfenced.lastIndexOf("}"), unfenced.lastIndexOf("]"));
  return end > start ? unfenced.slice(start, end + 1) : unfenced.slice(start);
}

/**
 * Pede ao Gemini uma resposta em JSON e a valida com Zod. Se a IA responder fora do formato,
 * lança GeminiBadResponseError (mensagem amigável); nunca deixa um JSON torto chegar ao sistema.
 */
export async function generateJson<T>(
  request: GeminiRequest,
  schema: z.ZodType<T>,
  opts: { runner?: GeminiRunner; models?: string[] } = {},
): Promise<T> {
  const text = await generateText(request, opts);
  let raw: unknown;
  try {
    raw = JSON.parse(extractJsonText(text));
  } catch {
    throw new GeminiBadResponseError();
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new GeminiBadResponseError();
  return parsed.data;
}
