import { z } from "zod";
import { generateGrounded, type GroundedResult, type GroundedRunner, type GroundedSource } from "@/lib/gemini/grounded";
import { extractJsonText } from "@/lib/gemini/json";
import { GeminiBadResponseError } from "@/lib/gemini/errors";
import { findFreshPartConsult, savePartConsult } from "@/lib/db/repositories/partConsults";

/** Marcas que a oficina quer consultar. */
export const PARTS_BRANDS = ["Mahle", "Metal Leve", "Bosch", "Fras-le", "Magneti Marelli", "Cofap", "Nakata", "LUK", "Sachs"];

export const PARTS_CONSULT_WARNING =
  "São sugestões da pesquisa na internet, não uma lista oficial. Confirme o código e a aplicação com o fornecedor antes de comprar.";

export const consultPartInputSchema = z.object({
  marca: z.string().trim().min(1, "Informe a marca do veículo"),
  modelo: z.string().trim().min(1, "Informe o modelo do veículo"),
  ano: z.string().trim().optional(),
  versao: z.string().trim().optional(),
  peca: z.string().trim().min(2, "Diga qual peça você procura"),
});
export type ConsultPartInput = z.infer<typeof consultPartInputSchema>;

/** O que o modelo devolve (o servidor completa fontes e confiança). */
const modelOutputSchema = z.object({
  resultados: z
    .array(
      z.object({
        marca: z.string().trim().min(1),
        codigo: z.string().trim().min(2),
        descricao: z.string().nullish().transform((v) => v ?? ""),
        aplicacao: z.string().nullish().transform((v) => v ?? ""),
      }),
    )
    .default([]),
});

export type PartConfidence = "ALTA" | "MEDIA" | "BAIXA";

export interface PartCodeResult {
  marca: string;
  codigo: string;
  descricao: string;
  aplicacao: string;
  confianca: PartConfidence;
  /** Só fontes reais da pesquisa que apoiam este código. */
  fontes: GroundedSource[];
}

export interface PartConsultOutcome {
  resultados: PartCodeResult[];
  aviso: string;
}

export function buildPartsPrompt(input: ConsultPartInput): string {
  const vehicle = [input.marca, input.modelo, input.versao, input.ano].filter(Boolean).join(" ");
  return `Você ajuda uma oficina mecânica no Brasil a achar códigos de catálogo de autopeças.
Use a pesquisa na internet para verificar códigos REAIS em sites de fabricantes, lojas e catálogos.

VEÍCULO: ${vehicle}
PEÇA: ${input.peca}
MARCAS DE INTERESSE: ${PARTS_BRANDS.join(", ")}

Regras:
- Só inclua um código se você o encontrou em uma fonte pesquisada para este veículo/ano. NÃO invente nem adivinhe códigos.
- No máximo 2 códigos por marca; ignore marcas que não fabricam essa peça ou para as quais não achou nada.
- Responda APENAS com um JSON válido, sem markdown, neste formato:
{"resultados":[{"marca":"Nome da marca","codigo":"CÓDIGO","descricao":"ex.: Pastilha de freio dianteira","aplicacao":"nota curta de aplicação (ano/motor)"}]}
- Se não achar nada confiável, responda {"resultados":[]}.`;
}

/** Posição de byte (UTF-8) em que `index` (posição em caracteres) cai no texto. */
function byteOffset(text: string, index: number): number {
  return new TextEncoder().encode(text.slice(0, index)).length;
}

/**
 * Confiança calculada PELO SERVIDOR, não pelo modelo: olha em quantas fontes distintas da pesquisa o
 * trecho que contém o código está apoiado. ALTA = 2 ou mais fontes; MÉDIA = 1; BAIXA = nenhuma.
 */
export function evaluateCodeSupport(
  code: string,
  grounded: Pick<GroundedResult, "text" | "chunks" | "supports">,
): { confianca: PartConfidence; fontes: GroundedSource[] } {
  const needle = code.toLowerCase();
  const haystack = grounded.text.toLowerCase();
  const chunkIndices = new Set<number>();
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    const bytePos = byteOffset(grounded.text, at);
    for (const s of grounded.supports) {
      if (bytePos >= s.start && bytePos < s.end) s.chunkIndices.forEach((i) => chunkIndices.add(i));
    }
    from = at + needle.length;
  }

  const sources: GroundedSource[] = [];
  const seen = new Set<string>();
  for (const i of chunkIndices) {
    const chunk = grounded.chunks[i];
    if (!chunk) continue;
    const key = chunk.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(chunk);
  }
  const confianca: PartConfidence = sources.length >= 2 ? "ALTA" : sources.length === 1 ? "MEDIA" : "BAIXA";
  return { confianca, fontes: sources };
}

/** Lê a resposta da IA e junta fontes e confiança. Função pura (testável sem internet). */
export function buildPartCodeResults(grounded: GroundedResult): PartCodeResult[] {
  let raw: unknown;
  try {
    raw = JSON.parse(extractJsonText(grounded.text));
  } catch {
    throw new GeminiBadResponseError();
  }
  const parsed = modelOutputSchema.safeParse(raw);
  if (!parsed.success) throw new GeminiBadResponseError();

  const seen = new Set<string>();
  const order: Record<PartConfidence, number> = { ALTA: 0, MEDIA: 1, BAIXA: 2 };
  return parsed.data.resultados
    .filter((r) => {
      const key = `${r.marca.toLowerCase()}|${r.codigo.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((r) => ({ ...r, ...evaluateCodeSupport(r.codigo, grounded) }))
    .sort((a, b) => order[a.confianca] - order[b.confianca]);
}

export async function runPartsConsult(
  rawInput: unknown,
  opts: { runner?: GroundedRunner; models?: string[] } = {},
): Promise<PartConsultOutcome> {
  const input = consultPartInputSchema.parse(rawInput);
  const grounded = await generateGrounded(buildPartsPrompt(input), opts);
  return { resultados: buildPartCodeResults(grounded), aviso: PARTS_CONSULT_WARNING };
}

const CACHE_DAYS = 30;

function normalizeKeyPart(v: string | undefined): string {
  return (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Chave do cache: mesmo veículo e mesma peça (sem diferença de maiúsculas ou espaços). */
export function partsCacheKey(input: ConsultPartInput): string {
  return [input.marca, input.modelo, input.versao, input.ano, input.peca].map(normalizeKeyPart).join("|");
}

export interface PartConsultResponse extends PartConsultOutcome {
  fromCache: boolean;
  consultedAt: string;
}

/**
 * Consulta com cache de 30 dias por veículo + peça (`refresh` ignora o cache e consulta de novo).
 * Só consultas bem-sucedidas são guardadas.
 */
export async function consultPartsService(
  actorUserId: string,
  rawInput: unknown,
  opts: { refresh?: boolean; runner?: GroundedRunner; models?: string[] } = {},
): Promise<PartConsultResponse> {
  const input = consultPartInputSchema.parse(rawInput);
  const cacheKey = partsCacheKey(input);

  if (!opts.refresh) {
    const cached = await findFreshPartConsult(cacheKey, CACHE_DAYS);
    if (cached) {
      return { ...(cached.result as PartConsultOutcome), fromCache: true, consultedAt: cached.createdAt.toISOString() };
    }
  }

  const outcome = await runPartsConsult(input, { runner: opts.runner, models: opts.models });
  await savePartConsult({
    cacheKey,
    vehicleLabel: [input.marca, input.modelo, input.versao, input.ano].filter(Boolean).join(" "),
    partLabel: input.peca,
    result: outcome,
    createdByUserId: actorUserId,
  });
  return { ...outcome, fromCache: false, consultedAt: new Date().toISOString() };
}
