import { getMonthFinanceRaw, getMonthMarginRaw } from "@/lib/db/repositories/monthlyFinance";
import { marginPercentOf } from "@/lib/workOrders/margin";
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
  /** Margem das OS entregues no mês (estimada pelo custo gravado nos itens). */
  margin: {
    osCount: number;
    revenueCents: number;
    costCents: number;
    profitCents: number;
    marginPercent: number | null;
    itemsWithoutCost: number;
  };
}

async function loadMonth(month: string): Promise<MonthFinance> {
  const [raw, marginRaw] = await Promise.all([getMonthFinanceRaw(month), getMonthMarginRaw(month)]);
  const profitCents = marginRaw.revenueCents - marginRaw.costCents;
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
    margin: { ...marginRaw, profitCents, marginPercent: marginPercentOf(profitCents, marginRaw.revenueCents) },
  };
}

/** O mês escolhido e o mês anterior, para a comparação. */
export async function getMonthFinanceService(month: string): Promise<{ current: MonthFinance; previous: MonthFinance }> {
  const [current, previous] = await Promise.all([loadMonth(month), loadMonth(shiftMonth(month, -1))]);
  return { current, previous };
}
