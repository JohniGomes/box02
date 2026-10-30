import { z } from "zod";
import { generateJson } from "./json";
import type { GeminiRunner } from "./client";
import { formatPlate, normalizePlate } from "@/lib/validation/plate";

/** Dados do VEÍCULO lidos de uma foto do CRLV. Nada do proprietário (nome, CPF/CNPJ, endereço) é lido. */
export interface CrlvVehicle {
  placa?: string;
  chassi?: string;
  renavam?: string;
  marca?: string;
  modelo?: string;
  versao?: string;
  anoFabricacao?: number;
  anoModelo?: number;
  cor?: string;
  combustivel?: string;
  confianca: "ALTA" | "MEDIA" | "BAIXA";
}

export const FUEL_OPTIONS = ["Flex", "Gasolina", "Etanol", "Diesel", "GNV", "Elétrico", "Híbrido"] as const;

const PROMPT = `Você lê a foto de um CRLV (documento de licenciamento de veículo brasileiro) para uma oficina mecânica.

Retorne APENAS um JSON válido, sem markdown e sem explicações, exatamente neste formato:

{
  "placa": "string ou null",
  "chassi": "string ou null (17 caracteres)",
  "renavam": "string ou null (só números)",
  "marca": "string ou null (ex.: Volkswagen)",
  "modelo": "string ou null (ex.: Gol)",
  "versao": "string ou null (ex.: 1.6 MSI)",
  "anoFabricacao": "número ou null",
  "anoModelo": "número ou null",
  "cor": "string ou null",
  "combustivel": "string ou null (ex.: ALCOOL/GASOLINA, GASOLINA, DIESEL)",
  "confianca": "ALTA, MEDIA ou BAIXA conforme a legibilidade da foto"
}

Regras:
- Leia SOMENTE dados do veículo. NÃO leia nem retorne nome do proprietário, CPF/CNPJ, endereço ou qualquer dado pessoal: ignore esses campos.
- O campo "MARCA / MODELO / VERSÃO" do documento vem junto (ex.: "VW/GOL 1.6 MSI"): separe em marca, modelo e versão do melhor jeito.
- Se um campo não estiver legível ou não existir, use null. Nunca invente.`;

function toYear(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/\D/g, "")) : NaN;
  const max = new Date().getFullYear() + 1;
  return Number.isInteger(n) && n >= 1950 && n <= max ? n : undefined;
}

const optText = z.string().nullish().transform((v) => (v && v.trim() ? v.trim() : undefined));

const RawSchema = z.object({
  placa: optText,
  chassi: optText,
  renavam: optText,
  marca: optText,
  modelo: optText,
  versao: optText,
  anoFabricacao: z.unknown().transform(toYear),
  anoModelo: z.unknown().transform(toYear),
  cor: optText,
  combustivel: optText,
  confianca: z.enum(["ALTA", "MEDIA", "BAIXA"]).catch("BAIXA"),
});

/** Mapeia o texto do documento (ALCOOL/GASOLINA, GASOLINA…) para uma das opções do formulário. */
export function mapFuel(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const t = text.toUpperCase();
  const alcohol = /ALCOOL|ÁLCOOL|ETANOL/.test(t);
  const gasoline = /GASOLINA/.test(t);
  if (/HIBRIDO|HÍBRIDO/.test(t)) return "Híbrido";
  if (/ELETRIC|ELÉTRIC/.test(t)) return "Elétrico";
  if (/DIESEL/.test(t)) return "Diesel";
  if (/GNV/.test(t)) return "GNV";
  if (alcohol && gasoline) return "Flex";
  if (/FLEX/.test(t)) return "Flex";
  if (alcohol) return "Etanol";
  if (gasoline) return "Gasolina";
  return undefined;
}

type Raw = z.infer<typeof RawSchema>;

/** Limpa o que a IA devolveu: placa no formato do sistema, chassi em maiúsculas, RENAVAM só números. */
export function normalizeCrlv(raw: Raw): CrlvVehicle {
  const plate = raw.placa ? normalizePlate(raw.placa) : "";
  const chassis = raw.chassi ? raw.chassi.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
  const renavam = raw.renavam ? raw.renavam.replace(/\D/g, "") : "";
  return {
    placa: plate ? formatPlate(plate) : undefined,
    chassi: chassis || undefined,
    renavam: renavam || undefined,
    marca: raw.marca,
    modelo: raw.modelo,
    versao: raw.versao,
    anoFabricacao: raw.anoFabricacao,
    anoModelo: raw.anoModelo,
    cor: raw.cor,
    combustivel: mapFuel(raw.combustivel),
    confianca: raw.confianca,
  };
}

export async function extractVehicleFromCrlv(
  imageBase64: string,
  mimeType: string,
  opts: { runner?: GeminiRunner; models?: string[] } = {},
): Promise<CrlvVehicle> {
  const parts = [{ text: PROMPT }, { inlineData: { data: imageBase64, mimeType } }];
  const raw = await generateJson({ contents: [{ role: "user", parts }] }, RawSchema, opts);
  return normalizeCrlv(raw);
}
