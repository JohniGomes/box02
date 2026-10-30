import { z } from "zod";
import { generateJson } from "./json";
import type { GeminiRunner } from "./client";

/** O que a IA leu de uma nota/recibo de compra de peças. Só fornecedor, data, itens e valores: nada do comprador. */
export interface PurchaseInvoice {
  fornecedor?: string;
  /** AAAA-MM-DD, nunca no futuro. */
  data?: string;
  itens: { descricao: string; quantidade: number; totalCents: number | null }[];
  /** Frete (positivo) menos desconto: o que falta para o total fechar. */
  ajusteCents?: number;
  confianca: "ALTA" | "MEDIA" | "BAIXA";
}

const PROMPT = `Você lê a foto de uma nota fiscal ou recibo de COMPRA de peças feita por uma oficina mecânica.

Retorne APENAS um JSON válido, sem markdown e sem explicações, exatamente neste formato:

{
  "fornecedor": "string ou null (nome da loja/fornecedor que vendeu)",
  "data": "string AAAA-MM-DD ou null (data da compra/emissão)",
  "itens": [
    { "descricao": "string", "quantidade": "número (padrão 1)", "valorTotalCentavos": "número em centavos (total da linha) ou null", "valorUnitarioCentavos": "número em centavos ou null" }
  ],
  "freteCentavos": "número ou null",
  "descontoCentavos": "número ou null",
  "confianca": "ALTA, MEDIA ou BAIXA conforme a legibilidade"
}

Regras:
- Leia só o que é da compra: fornecedor, data, itens, quantidades e valores. NÃO leia nem retorne dados do comprador (nome, CPF/CNPJ, endereço).
- Valores em centavos (ex.: R$ 52,90 → 5290). Se só houver o valor unitário, preencha o unitário.
- Se um campo não estiver legível, use null. Nunca invente itens nem valores.`;

function toNumber(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    const n = Number(cleaned);
    return cleaned !== "" && Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

const optText = z.string().nullish().transform((v) => (v && v.trim() ? v.trim() : undefined));

const RawSchema = z.object({
  fornecedor: optText,
  data: optText,
  itens: z
    .array(
      z.object({
        descricao: z.string().nullish().transform((v) => (v ?? "").trim()),
        quantidade: z.unknown().optional().transform(toNumber),
        valorTotalCentavos: z.unknown().optional().transform(toNumber),
        valorUnitarioCentavos: z.unknown().optional().transform(toNumber),
      }),
    )
    .nullish()
    .transform((v) => v ?? []),
  freteCentavos: z.unknown().optional().transform(toNumber),
  descontoCentavos: z.unknown().optional().transform(toNumber),
  confianca: z.enum(["ALTA", "MEDIA", "BAIXA"]).catch("BAIXA"),
});

type Raw = z.infer<typeof RawSchema>;

function validPastDate(value: string | undefined, today: string): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return undefined;
  return value <= today ? value : undefined;
}

/** Limpa a leitura: quantidade inteira (mínimo 1), total da linha (ou unitário × quantidade), data válida e não futura. */
export function normalizeInvoice(raw: Raw, today: string): PurchaseInvoice {
  const itens = raw.itens
    .filter((i) => i.descricao !== "")
    .map((i) => {
      const quantidade = Math.max(1, Math.round(i.quantidade ?? 1));
      const total =
        i.valorTotalCentavos !== undefined
          ? Math.round(i.valorTotalCentavos)
          : i.valorUnitarioCentavos !== undefined
            ? Math.round(i.valorUnitarioCentavos * quantidade)
            : null;
      return { descricao: i.descricao, quantidade, totalCents: total !== null && total > 0 ? total : null };
    });
  const ajuste = Math.round((raw.freteCentavos ?? 0) - (raw.descontoCentavos ?? 0));
  return {
    fornecedor: raw.fornecedor,
    data: validPastDate(raw.data, today),
    itens,
    ajusteCents: ajuste !== 0 ? ajuste : undefined,
    confianca: raw.confianca,
  };
}

export async function extractPurchaseInvoice(
  imageBase64: string,
  mimeType: string,
  today: string,
  opts: { runner?: GeminiRunner; models?: string[] } = {},
): Promise<PurchaseInvoice> {
  const parts = [{ text: PROMPT }, { inlineData: { data: imageBase64, mimeType } }];
  const raw = await generateJson({ contents: [{ role: "user", parts }] }, RawSchema, opts);
  return normalizeInvoice(raw, today);
}
