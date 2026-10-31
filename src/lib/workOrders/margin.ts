/**
 * Margem de uma OS (uso interno). Receita e custo vêm só dos itens EXECUTADOS, igual ao valor
 * devido da OS; o custo de cada item é o gravado no momento da execução (null = não informado,
 * entra como zero).
 *
 * A margem das PEÇAS é real (o custo vem do estoque). Mão de obra e serviços não têm custo por OS:
 * quem executa são os sócios, e o que sai para eles é o pró-labore, lançado em Despesas. Por isso o
 * aviso de "sem custo" conta só peças, e a mão de obra aparece à parte, "antes do pró-labore".
 */

export interface MarginItem {
  status: string;
  /** SERVICO, PECA ou MAO_DE_OBRA; sem tipo conta como peça. */
  type?: string;
  totalCents: number;
  quantity: string | number;
  unitCostCents: number | null;
}

export interface Margin {
  revenueCents: number;
  costCents: number;
  profitCents: number;
  /** null quando não há receita para dividir. */
  marginPercent: number | null;
  /** Peças executadas sem custo informado (a margem real pode ser menor). */
  itemsWithoutCost: number;
  /** Itens ainda planejados (a margem é parcial enquanto houver). */
  pendingItems: number;
  /** Taxa estimada da maquininha sobre o que foi pago no cartão (já descontada do lucro). */
  cardFeeCents: number;
  /** Peças executadas: venda e custo. */
  partsRevenueCents: number;
  partsCostCents: number;
  /** Serviço e mão de obra executados (sem custo por OS), antes do pró-labore. */
  laborRevenueCents: number;
}

export function marginPercentOf(profitCents: number, revenueCents: number): number | null {
  return revenueCents > 0 ? Math.round((profitCents / revenueCents) * 100) : null;
}

/** Taxa estimada da maquininha: o pago no cartão (já sem estornos) vezes a porcentagem. */
export function cardFeeOf(cardPaidCents: number, percent: number): number {
  return Math.max(0, Math.round((cardPaidCents * percent) / 100));
}

const isPart = (i: MarginItem) => i.type === undefined || i.type === "PECA";

export function computeMargin(items: MarginItem[], discountCents: number, cardFeeCents = 0): Margin {
  const executed = items.filter((i) => i.status === "EXECUTADO");
  const parts = executed.filter(isPart);
  const revenueCents = executed.reduce((sum, i) => sum + i.totalCents, 0) - discountCents;
  const costCents = executed.reduce((sum, i) => sum + Math.round(Number(i.quantity) * (i.unitCostCents ?? 0)), 0);
  const profitCents = revenueCents - costCents - cardFeeCents;
  return {
    revenueCents,
    costCents,
    profitCents,
    marginPercent: marginPercentOf(profitCents, revenueCents),
    itemsWithoutCost: parts.filter((i) => i.unitCostCents === null).length,
    pendingItems: items.filter((i) => i.status === "PLANEJADO").length,
    cardFeeCents,
    partsRevenueCents: parts.reduce((sum, i) => sum + i.totalCents, 0),
    partsCostCents: parts.reduce((sum, i) => sum + Math.round(Number(i.quantity) * (i.unitCostCents ?? 0)), 0),
    laborRevenueCents: executed.filter((i) => !isPart(i)).reduce((sum, i) => sum + i.totalCents, 0),
  };
}
