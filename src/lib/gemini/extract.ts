import { z } from "zod";
import { generateJson } from "./json";
import type { GeminiRunner } from "./client";

export interface ExtractedItem {
  tipo: "SERVICO" | "PECA" | "OUTRO";
  descricao: string;
  quantidade: number;
  precoUnitarioCentavos: number | null;
}

export interface ExtractedData {
  cliente: {
    nome: string;
    telefone?: string;
    documento?: string;
  } | null;
  veiculo: {
    marca?: string;
    modelo?: string;
    ano?: number;
    placa?: string;
    cor?: string;
    quilometragem?: number;
  } | null;
  itens: ExtractedItem[];
  observacoes: string;
  confianca: "ALTA" | "MEDIA" | "BAIXA";
  textoOriginal: string;
}

const PROMPT_SISTEMA = `Você é um assistente de uma oficina mecânica chamada BOX 02. Sua tarefa é extrair informações estruturadas de textos ou fotos de anotações, cadernos, ordens de serviço manuscritas ou notas fiscais.

Retorne APENAS um JSON válido, sem markdown, sem explicações, com a estrutura exata abaixo:

{
  "cliente": {
    "nome": "string ou null",
    "telefone": "string ou null",
    "documento": "string ou null (CPF ou CNPJ)"
  },
  "veiculo": {
    "marca": "string ou null",
    "modelo": "string ou null",
    "ano": "número ou null",
    "placa": "string ou null (formato ABC-1234 ou ABC1D23)",
    "cor": "string ou null",
    "quilometragem": "número ou null"
  },
  "itens": [
    {
      "tipo": "SERVICO ou PECA",
      "descricao": "descrição do item",
      "quantidade": "número (padrão 1)",
      "precoUnitarioCentavos": "número em centavos ou null se não informado"
    }
  ],
  "observacoes": "qualquer outra informação relevante",
  "confianca": "ALTA, MEDIA ou BAIXA dependendo da legibilidade/clareza"
}

Regras importantes:
- Se um campo não estiver presente ou não for legível, use null
- Peças (ex: filtro de óleo, pastilha de freio, pneu) → tipo PECA
- Serviços (ex: troca de óleo, alinhamento, revisão) → tipo SERVICO
- Preços: converta para centavos (ex: R$ 50,00 → 5000)
- Placa: normalize para formato com hífen (ex: ABC1234 → ABC-1234)
- Telefone: mantenha apenas dígitos com DDD
- confianca: ALTA = tudo claro, MEDIA = algumas dúvidas, BAIXA = muito difícil de ler`;

/** Número que a IA às vezes devolve como texto ("98.000", "2015"). */
function toNumber(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const digits = v.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    const n = Number(digits);
    return digits !== "" && Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

const optText = z.string().nullish().transform((v) => (v ? v : undefined));
const optNumber = z.unknown().transform(toNumber);

const ItemSchema = z.object({
  tipo: z.enum(["SERVICO", "PECA", "OUTRO"]).catch("OUTRO"),
  descricao: z.string().nullish().transform((v) => v ?? ""),
  quantidade: z.unknown().transform((v) => toNumber(v) ?? 1),
  precoUnitarioCentavos: z.unknown().transform((v) => toNumber(v) ?? null),
});

/** Formato que o Gemini deve devolver; tolerante com campos nulos/texto, rígido no que importa. */
export const ExtractedCoreSchema = z.object({
  cliente: z
    .object({ nome: z.string().nullish().transform((v) => v ?? ""), telefone: optText, documento: optText })
    .nullish()
    .transform((v) => v ?? null),
  veiculo: z
    .object({ marca: optText, modelo: optText, ano: optNumber, placa: optText, cor: optText, quilometragem: optNumber })
    .nullish()
    .transform((v) => v ?? null),
  itens: z
    .array(ItemSchema)
    .nullish()
    .transform((items) => (items ?? []).filter((i) => i.descricao.trim() !== "")),
  observacoes: z.string().nullish().transform((v) => v ?? ""),
  confianca: z.enum(["ALTA", "MEDIA", "BAIXA"]).catch("BAIXA"),
});

interface ExtractOptions {
  runner?: GeminiRunner;
  models?: string[];
}

export async function extractFromText(text: string, opts: ExtractOptions = {}): Promise<ExtractedData> {
  const prompt = `${PROMPT_SISTEMA}

Texto para analisar:
${text}`;
  const parsed = await generateJson(prompt, ExtractedCoreSchema, opts);
  return { ...parsed, textoOriginal: text };
}

export async function extractFromImage(
  imageBase64: string,
  mimeType: string,
  extraText?: string,
  opts: ExtractOptions = {},
): Promise<ExtractedData> {
  const contentParts = [
    { text: PROMPT_SISTEMA + (extraText ? `

Informação adicional: ${extraText}` : "") },
    { inlineData: { data: imageBase64, mimeType } },
  ];
  const parsed = await generateJson({ contents: [{ role: "user", parts: contentParts }] }, ExtractedCoreSchema, opts);
  return { ...parsed, textoOriginal: extraText ?? "[imagem]" };
}
