import { formatBRL, reaisToCents } from "@/lib/money";

/** Aviso amarelo (nunca trava): valor digitado muito diferente do preço padrão do serviço (mais de 20%). */
export function priceToleranceWarning(estimateReais: string | null | undefined, unitPriceReais: string): string | null {
  if (!estimateReais || !unitPriceReais.trim()) return null;
  let estimateCents: number;
  let priceCents: number;
  try {
    estimateCents = reaisToCents(estimateReais);
    priceCents = reaisToCents(unitPriceReais);
  } catch {
    return null;
  }
  if (estimateCents <= 0 || priceCents <= 0) return null;
  const diff = (priceCents - estimateCents) / estimateCents;
  if (Math.abs(diff) <= 0.2) return null;
  const pct = Math.round(Math.abs(diff) * 100);
  return `Valor ${formatBRL(priceCents)} está ${pct}% ${diff > 0 ? "acima" : "abaixo"} do preço padrão deste serviço (${formatBRL(estimateCents)}). É só um aviso: pode seguir normalmente.`;
}
