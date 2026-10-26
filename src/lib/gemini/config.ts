/**
 * Configuração do Gemini — funções puras (sem rede), fáceis de testar.
 *
 * O caractere invisível que quebrava o assistente (U+FEFF, "BOM", código 65279) costuma
 * vir de colar a chave de um documento ou site na Vercel. Aqui toda chave é limpa antes de
 * ir para um cabeçalho HTTP.
 */

const INVISIBLE_CHARS = /[​-‍⁠﻿ ]/g;

/** Chave sem caracteres invisíveis, espaços e aspas. Vazia se não houver chave. */
export function cleanApiKey(raw: string | null | undefined): string {
  return (raw ?? "")
    .replace(INVISIBLE_CHARS, "")
    .replace(/\s+/g, "")
    .replace(/^["']+|["']+$/g, "");
}

/** Nome do modelo limpo (mesmos cuidados, mas aceita pontos e hífens). */
export function cleanModelName(raw: string | null | undefined): string {
  return (raw ?? "").replace(INVISIBLE_CHARS, "").replace(/\s+/g, "").replace(/^["']+|["']+$/g, "");
}

/** Modelos tentados em ordem; se o primeiro não existir mais para a chave, tenta o próximo. */
export const DEFAULT_GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];

/** O modelo pedido em GEMINI_MODEL vai primeiro; depois os padrões, sem repetir. */
export function geminiModelCandidates(envModel?: string | null): string[] {
  const first = cleanModelName(envModel);
  return [...new Set([...(first ? [first] : []), ...DEFAULT_GEMINI_MODELS])];
}
