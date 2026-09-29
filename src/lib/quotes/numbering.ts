import { incrementCounter } from "@/lib/db/repositories/appSettings";

/**
 * Numeração do orçamento — implementação PROVISÓRIA (K3): sequencial por
 * ano, formato "ORC-2026-000001". A decisão D3 (se a numeração da OS
 * reinicia por ano ou é contínua) ainda não foi formalizada; quando for,
 * a mesma regra deve valer aqui. Todo o resto do módulo de orçamento só
 * chama `generateQuoteNumber()` — trocar a implementação aqui dentro não
 * exige tocar em mais nada.
 */
export async function generateQuoteNumber(referenceDate: Date = new Date()): Promise<string> {
  const year = referenceDate.getFullYear();
  const seq = await incrementCounter(`quote_number_seq_${year}`);
  return `ORC-${year}-${String(seq).padStart(6, "0")}`;
}
