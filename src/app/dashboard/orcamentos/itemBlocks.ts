import type { ItemDraft } from "./QuoteForm";
import { formatBRL, lineTotalCents, reaisToCents } from "@/lib/money";

type ItemCategory = "NECESSARIO" | "RECOMENDADO" | "INFORMATIVO";

/** Bloco do item para gravar: chave do grupo e categoria herdada do serviço-cabeça. */
export function blockFieldsOf(items: ItemDraft[], i: ItemDraft): { groupKey?: string; category: ItemCategory } {
  return {
    groupKey: i.groupKey ?? (items.some((c) => c.groupKey === i.key) ? i.key : undefined),
    category: i.groupKey ? (items.find((h) => h.key === i.groupKey)?.category ?? i.category) : i.category,
  };
}

/** Aviso amarelo (nunca trava): mão de obra do bloco muito diferente da estimativa do serviço. */
export function laborToleranceWarning(items: ItemDraft[], head: ItemDraft | undefined): string | null {
  if (!head || head.type !== "SERVICO" || !head.estimateReais) return null;
  const estimateCents = reaisToCents(head.estimateReais);
  if (estimateCents <= 0) return null;
  const labor = items.filter((i) => i.groupKey === head.key && i.type === "MAO_DE_OBRA");
  if (labor.length === 0) return null;
  const laborCents = labor.reduce(
    (sum, i) => sum + lineTotalCents(Number(i.quantity.replace(",", ".")) || 0, reaisToCents(i.unitPriceReais || "0")),
    0,
  );
  const diff = (laborCents - estimateCents) / estimateCents;
  if (Math.abs(diff) <= 0.2) return null;
  const pct = Math.round(Math.abs(diff) * 100);
  return `Mão de obra ${formatBRL(laborCents)} está ${pct}% ${diff > 0 ? "acima" : "abaixo"} da estimativa deste serviço (${formatBRL(estimateCents)}). É só um aviso: pode seguir normalmente.`;
}
