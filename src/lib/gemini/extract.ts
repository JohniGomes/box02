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
  /** Preenchido só quando a pessoa pede o código/referência de uma peça (não é lançamento). */
  consultaPeca?: {
    peca: string;
    marca?: string;
    modelo?: string;
    ano?: number;
    versao?: string;
  } | null;
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
  "consultaPeca": {
    "peca": "nome da peça procurada",
    "marca": "marca do veículo ou null",
    "modelo": "modelo do veículo ou null",
    "ano": "número ou null",
    "versao": "motor/versão ou null"
  } ou null,
  "observacoes": "qualquer outra informação relevante",
  "confianca": "ALTA, MEDIA ou BAIXA dependendo da legibilidade/clareza"
}

Regras importantes:
- consultaPeca: preencha SOMENTE quando a pessoa pede o código, a referência ou o número de catálogo de uma peça para um veículo (ex.: "código do freio dianteiro do HR-V 2017"). Nesse caso deixe "itens" vazio. Em qualquer outro caso use null. Se souber a marca pelo modelo (ex.: HR-V é Honda), preencha a marca.
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
const optNumber = z.unknown().optional().transform(toNumber);

const ItemSchema = z.object({
  tipo: z.enum(["SERVICO", "PECA", "OUTRO"]).catch("OUTRO"),
  descricao: z.string().nullish().transform((v) => v ?? ""),
  quantidade: z.unknown().optional().transform((v) => toNumber(v) ?? 1),
  precoUnitarioCentavos: z.unknown().optional().transform((v) => toNumber(v) ?? null),
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
  consultaPeca: z
    .object({
      peca: z.string().nullish().transform((v) => (v ?? "").trim()),
      marca: optText,
      modelo: optText,
      ano: optNumber,
      versao: optText,
    })
    .nullish()
    .transform((v) => (v && v.peca ? v : null)),
  observacoes: z.string().nullish().transform((v) => v ?? ""),
  confianca: z.enum(["ALTA", "MEDIA", "BAIXA"]).catch("BAIXA"),
});

interface ExtractOptions {
  runner?: GeminiRunner;
  models?: string[];
  /** Veículo de que a conversa já estava tratando (ex.: "Honda HR-V 2017"), para pedidos como "agora a pastilha traseira". */
  contexto?: string;
}

export async function extractFromText(text: string, opts: ExtractOptions = {}): Promise<ExtractedData> {
  const contexto = opts.contexto?.trim().slice(0, 120);
  const prompt = `${PROMPT_SISTEMA}
${contexto ? `
Contexto da conversa: o veículo de que já se falava é "${contexto}". Se o texto abaixo não citar outro veículo, use este.
` : ""}
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
