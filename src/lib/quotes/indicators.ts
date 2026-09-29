import type { Pool, PoolClient } from "pg";
import {
  fetchQuoteIndicatorsCore,
  fetchQuoteIndicatorsItemValues,
} from "@/lib/db/repositories/quoteIndicators";

/**
 * Os sete indicadores da seção J da proposta funcional aprovada
 * (PROPOSTA_ORCAMENTO_CICLO4.md). Sem tela — só o serviço de leitura,
 * conforme combinado para esta sub-etapa.
 *
 * DEFINIÇÕES OPERACIONAIS (a proposta original descrevia a fórmula em
 * linguagem natural; aqui estão as decisões de borda que tive que tomar
 * para implementar sem ambiguidade — nenhuma delas é regra de negócio
 * nova, são só a tradução exata da fórmula já aprovada):
 *
 * - Todo indicador usa a VERSÃO VIGENTE de cada orçamento (nunca soma
 *   versões antigas já substituídas — evita contar o mesmo orçamento
 *   duas vezes).
 * - "Enviado" = `sentAt IS NOT NULL`. Um RASCUNHO nunca enviado (mesmo
 *   que depois CANCELADO) não entra em nenhum indicador de valor/taxa —
 *   só na contagem bruta de orçamentos (indicador 1).
 * - Um orçamento CANCELADO que já tinha sido enviado antes do
 *   cancelamento CONTINUA contando no valor total orçado e no
 *   denominador da taxa de conversão (foi enviado de verdade), mas
 *   nunca no numerador (não foi aprovado) nem no tempo até decisão
 *   (cancelamento não é uma decisão do cliente).
 * - "Aprovado" para fins de taxa de conversão inclui tanto aprovação
 *   total quanto parcial — um orçamento parcialmente aprovado é uma
 *   conversão, só que incompleta.
 * - Valor aprovado/recusado somam por ITEM (`clientDecision`), não por
 *   orçamento — é isso que torna a aprovação parcial contabilizada
 *   corretamente (só a fatia aprovada entra no valor aprovado).
 */
export interface QuoteIndicators {
  /** Indicador 1 — quantidade total de orçamentos (todos os status, inclusive rascunho). */
  totalQuotes: number;
  /** Indicador 2 — soma do total de todo orçamento que já foi enviado ao menos uma vez. */
  totalQuotedValueCents: number;
  /** Indicador 3 — soma dos itens com decisão APROVADO (inclui itens de orçamentos parciais). */
  approvedValueCents: number;
  /** Indicador 4 — soma dos itens com decisão RECUSADO. */
  rejectedValueCents: number;
  /** Indicador 5 — (aprovados totais + parciais) ÷ enviados. 0 se nada foi enviado ainda. */
  conversionRate: number;
  /** Indicador 6 — média de horas entre o envio e a decisão do cliente. null se nenhum orçamento foi decidido ainda. */
  avgTimeToDecisionHours: number | null;
  /** Indicador 7 — valor médio (em centavos) dos orçamentos enviados. null se nenhum foi enviado ainda. */
  avgQuoteValueCents: number | null;
}

export async function getQuoteIndicatorsService(client?: Pool | PoolClient): Promise<QuoteIndicators> {
  // Sequencial, não Promise.all: quando um PoolClient dedicado é passado
  // (ex.: dentro de uma transação SERIALIZABLE em teste — ver DT3), um
  // PoolClient só processa uma consulta de cada vez. Sem client explícito
  // (uso normal em produção), o resultado é idêntico — só muda a ordem de
  // execução, nunca o valor.
  const core = client ? await fetchQuoteIndicatorsCore(client) : await fetchQuoteIndicatorsCore();
  const itemValues = client ? await fetchQuoteIndicatorsItemValues(client) : await fetchQuoteIndicatorsItemValues();

  const totalQuotes = Number(core.total_quotes);
  const sentCount = Number(core.sent_count);
  const totalQuotedValueCents = Number(core.total_quoted_cents);
  const approvedCount = Number(core.approved_count);
  const decidedCount = Number(core.decided_count);
  const decisionSecondsSum = Number(core.decision_seconds_sum);

  const conversionRate = sentCount > 0 ? approvedCount / sentCount : 0;
  const avgTimeToDecisionHours = decidedCount > 0 ? decisionSecondsSum / decidedCount / 3600 : null;
  const avgQuoteValueCents = sentCount > 0 ? Math.round(totalQuotedValueCents / sentCount) : null;

  return {
    totalQuotes,
    totalQuotedValueCents,
    approvedValueCents: Number(itemValues.approved_value_cents),
    rejectedValueCents: Number(itemValues.rejected_value_cents),
    conversionRate,
    avgTimeToDecisionHours,
    avgQuoteValueCents,
  };
}
