/**
 * Ciclo H — Precificação e Custos.
 *
 * Funções puras de cálculo — nenhuma delas grava nada, nenhuma delas é
 * chamada na criação de QuoteItem/WorkOrderItem (que continuam gravando
 * só o preço praticado, congelado, exatamente como antes deste ciclo).
 *
 * Terminologia (não tratar como sinônimos — H4-D2):
 * - CUSTO: Service.costCents, dado interno.
 * - MARKUP PADRÃO: app_settings, percentual único da oficina.
 * - PREÇO CALCULADO: custo × (1 + markup/100) — nunca armazenado.
 * - PREÇO SUGERIDO: defaultPriceCents (se preenchido) OU preço
 *   calculado (se não) — nunca armazenado como conceito próprio,
 *   sempre derivado no momento da leitura.
 * - PREÇO PRATICADO: o que de fato entra no orçamento/OS — já existia,
 *   intocado por este módulo.
 * - MARGEM ESTIMADA: (praticado − custo) ÷ praticado — margem sobre
 *   venda, nunca markup. Indicador, nunca armazenada.
 */

export type SuggestedPriceSource = "manual" | "calculado";

export interface SuggestedPriceResult {
  cents: number;
  source: SuggestedPriceSource;
}

/**
 * Regra de precedência (H4-D1, Alternativa D):
 * 1. defaultPriceCents preenchido -> preço sugerido manual.
 * 2. Senão, costCents preenchido E markup configurado -> preço calculado.
 * 3. Senão -> null (sem sugestão — "Variável", igual ao comportamento
 *    já existente antes deste ciclo).
 */
export function calcularPrecoSugerido(params: {
  defaultPriceCents: number | null;
  costCents: number | null;
  markupPercent: number | null;
}): SuggestedPriceResult | null {
  if (params.defaultPriceCents !== null) {
    return { cents: params.defaultPriceCents, source: "manual" };
  }
  if (params.costCents !== null && params.markupPercent !== null) {
    const calculated = Math.round(params.costCents * (1 + params.markupPercent / 100));
    return { cents: calculated, source: "calculado" };
  }
  return null;
}

/**
 * Margem sobre venda — (praticado − custo) ÷ praticado. Retorna a
 * fração (ex.: 0.2857 para 28,57%), não já multiplicada por 100.
 * `null` quando não há custo cadastrado ou quando o preço praticado é
 * zero (nunca retorna NaN/Infinity).
 */
export function calcularMargemEstimada(params: {
  costCents: number | null;
  practicedPriceCents: number;
}): number | null {
  if (params.costCents === null) return null;
  if (params.practicedPriceCents === 0) return null;
  return (params.practicedPriceCents - params.costCents) / params.practicedPriceCents;
}
