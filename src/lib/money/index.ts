/**
 * Todo cálculo monetário do orçamento é feito em CENTAVOS (inteiros).
 * Nunca fazer conta com `number` decimal representando reais — ponto
 * flutuante binário não representa exatamente valores como 0.10 ou 0.33,
 * e isso acumula erro de centavo em somas de várias linhas.
 *
 * Conversão para/de reais só acontece na borda (formulário, exibição).
 */

/** "129,90" ou "129.90" ou 129.9 -> 12990 (centavos). Nunca usar direto em cálculo intermediário. */
export function reaisToCents(value: string | number): number {
  if (typeof value !== "string") {
    return Number.isFinite(value) ? Math.round(value * 100) : 0;
  }
  // Só trata "." como separador de milhar quando há vírgula decimal
  // (formato BR "1.234,56"). Sem vírgula, "." é o separador decimal
  // (aceita também o formato "129.90"), evitando 1.299,00 virar 1299000.
  const hasComma = value.includes(",");
  const normalized = hasComma ? value.replace(/\./g, "").replace(",", ".") : value;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

/** 12990 -> "129,90" */
export function centsToReais(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** 12990 -> "R$ 129,90" */
export function formatBRL(cents: number): string {
  return `R$ ${centsToReais(cents)}`;
}

/**
 * Total de uma linha: quantidade (pode ter casas decimais, ex.: 1,5 hora de
 * mão de obra) × preço unitário em centavos, arredondado ao centavo mais
 * próximo — nunca trunca silenciosamente.
 */
export function lineTotalCents(quantity: number, unitPriceCents: number): number {
  return Math.round(quantity * unitPriceCents);
}

/**
 * Aplica desconto ou acréscimo sobre uma base em centavos.
 * PERCENTUAL: `value` é o percentual × 100 (1050 = 10,50%).
 * FIXO: `value` já é centavos.
 * Retorna o valor do ajuste em centavos (sempre positivo — quem soma ou
 * subtrai é o chamador).
 */
export function applyAdjustment(
  baseCents: number,
  type: "PERCENTUAL" | "FIXO" | null | undefined,
  value: number | null | undefined,
): number {
  if (!type || value === null || value === undefined) return 0;
  if (type === "FIXO") return Math.max(0, Math.round(value));
  // PERCENTUAL: value=1050 significa 10,50% -> (baseCents * 1050) / 10000
  return Math.round((baseCents * value) / 10000);
}

export interface QuoteTotals {
  subtotalServicesCents: number;
  subtotalPartsCents: number;
  subtotalLaborCents: number;
  discountTotalCents: number;
  surchargeTotalCents: number;
  totalCents: number;
}

export interface QuoteTotalsInput {
  items: { type: "SERVICO" | "PECA" | "MAO_DE_OBRA"; totalCents: number }[];
  discountType?: "PERCENTUAL" | "FIXO" | null;
  discountValue?: number | null;
  surchargeType?: "PERCENTUAL" | "FIXO" | null;
  surchargeValue?: number | null;
}

/**
 * Total de uma versão de orçamento: soma dos itens, com desconto e depois
 * acréscimo aplicados em sequência.
 *
 * REGRA DE NEGÓCIO (aprovada — Ciclo 4, Sub-etapa 1): o acréscimo incide
 * sobre o valor JÁ COM DESCONTO aplicado, nunca sobre o subtotal bruto.
 * Exemplo: subtotal R$100, desconto 10% (R$10) -> base R$90; acréscimo 10%
 * sobre essa base = R$9, não R$10. Total final: R$99.
 *
 * Esta ordem (desconto primeiro, acréscimo depois, em cascata) deve ser
 * mantida consistente em qualquer lugar futuro que recalcule ou exiba
 * esses valores — Ordem de Serviço, faturamento, indicadores. Não
 * reimplementar esse cálculo em outro módulo; sempre chamar
 * `computeQuoteTotals` (ou uma função que explicitamente documente e
 * preserve esta mesma ordem, se o dado de entrada for diferente).
 */
export function computeQuoteTotals(input: QuoteTotalsInput): QuoteTotals {
  const subtotalServicesCents = sumByType(input.items, "SERVICO");
  const subtotalPartsCents = sumByType(input.items, "PECA");
  const subtotalLaborCents = sumByType(input.items, "MAO_DE_OBRA");
  const itemsSubtotal = subtotalServicesCents + subtotalPartsCents + subtotalLaborCents;

  const discountTotalCents = applyAdjustment(itemsSubtotal, input.discountType, input.discountValue);
  const afterDiscount = Math.max(0, itemsSubtotal - discountTotalCents);
  const surchargeTotalCents = applyAdjustment(afterDiscount, input.surchargeType, input.surchargeValue);
  const totalCents = afterDiscount + surchargeTotalCents;

  return {
    subtotalServicesCents,
    subtotalPartsCents,
    subtotalLaborCents,
    discountTotalCents,
    surchargeTotalCents,
    totalCents,
  };
}

function sumByType(
  items: { type: string; totalCents: number }[],
  type: string,
): number {
  return items.filter((i) => i.type === type).reduce((sum, i) => sum + i.totalCents, 0);
}
