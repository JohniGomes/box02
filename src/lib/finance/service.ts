import { getMonthFinanceRaw, getMonthMarginRaw } from "@/lib/db/repositories/monthlyFinance";
import { cardFeeOf, marginPercentOf } from "@/lib/workOrders/margin";
import { getCardFeePercent } from "@/lib/settings/service";
import { shiftMonth } from "./month";

export interface MonthFinance {
  month: string;
  /** Entradas do mês já descontados os estornos. */
  revenueCents: number;
  refundsCents: number;
  expensesCents: number;
  proLaboreCents: number;
  resultCents: number;
  resultBeforeProLaboreCents: number;
  byMethod: { dinheiroCents: number; pixCents: number; cartaoCents: number; outroCents: number };
  expensesByCategory: { category: string; cents: number }[];
  unpaidDueCents: number;
  unpaidDueCount: number;
  /** Taxa da maquininha (%) e a taxa estimada sobre o que entrou no cartão no mês. */
  cardFeePercent: number;
  cardFeeCents: number;
  /** Taxa da maquininha repassada ao cliente neste mês (já fora das entradas). */
  cardFeePassedCents: number;
  /** Margem das OS entregues no mês (estimada pelo custo gravado nos itens). */
  margin: {
    osCount: number;
    revenueCents: number;
    costCents: number;
    profitCents: number;
    marginPercent: number | null;
    /** Só peças sem custo informado. */
    itemsWithoutCost: number;
    /** Peças: venda, custo e lucro (margem real). */
    partsRevenueCents: number;
    partsCostCents: number;
    /** Serviço/mão de obra executados, antes do pró-labore (sem custo por OS). */
    laborRevenueCents: number;
    discountsCents: number;
    /** Taxa estimada do cartão das OS entregues (já descontada do lucro). */
    cardFeeCents: number;
  };
}

async function loadMonth(month: string): Promise<MonthFinance> {
  const [raw, marginRaw, cardFeePercent] = await Promise.all([getMonthFinanceRaw(month), getMonthMarginRaw(month), getCardFeePercent()]);
  const marginCardFeeCents = cardFeeOf(marginRaw.cardPaidCents, cardFeePercent);
  const profitCents = marginRaw.revenueCents - marginRaw.costCents - marginCardFeeCents;
  const gross = Object.values(raw.paymentsByMethod).reduce((a, b) => a + b, 0);
  const revenueCents = gross - raw.refundsCents;
  const expensesCents = raw.expensesByCategory.reduce((a, b) => a + b.cents, 0);
  const proLaboreCents = raw.expensesByCategory.find((c) => c.category === "SALARIOS")?.cents ?? 0;
  return {
    month,
    revenueCents,
    refundsCents: raw.refundsCents,
    expensesCents,
    proLaboreCents,
    resultCents: revenueCents - expensesCents,
    resultBeforeProLaboreCents: revenueCents - expensesCents + proLaboreCents,
    byMethod: {
      dinheiroCents: raw.paymentsByMethod.DINHEIRO ?? 0,
      pixCents: raw.paymentsByMethod.PIX ?? 0,
      cartaoCents: raw.paymentsByMethod.CARTAO ?? 0,
      outroCents: raw.paymentsByMethod.OUTRO ?? 0,
    },
    expensesByCategory: raw.expensesByCategory,
    unpaidDueCents: raw.unpaidDueCents,
    unpaidDueCount: raw.unpaidDueCount,
    cardFeePercent,
    // Estimativa só sobre o cartão SEM taxa repassada registrada; onde a taxa foi repassada, a oficina não paga.
    cardFeeCents: cardFeeOf(raw.cardNoFeeCents, cardFeePercent),
    cardFeePassedCents: raw.cardFeePassedCents,
    margin: {
      osCount: marginRaw.osCount,
      revenueCents: marginRaw.revenueCents,
      costCents: marginRaw.costCents,
      itemsWithoutCost: marginRaw.itemsWithoutCost,
      partsRevenueCents: marginRaw.partsRevenueCents,
      partsCostCents: marginRaw.partsCostCents,
      laborRevenueCents: marginRaw.laborRevenueCents,
      discountsCents: marginRaw.discountsCents,
      cardFeeCents: marginCardFeeCents,
      profitCents,
      marginPercent: marginPercentOf(profitCents, marginRaw.revenueCents),
    },
  };
}

/** O mês escolhido e o mês anterior, para a comparação. */
export async function getMonthFinanceService(month: string): Promise<{ current: MonthFinance; previous: MonthFinance }> {
  const [current, previous] = await Promise.all([loadMonth(month), loadMonth(shiftMonth(month, -1))]);
  return { current, previous };
}
