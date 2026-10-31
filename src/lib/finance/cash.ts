import {
  listCashReceivables,
  listPaymentsBetween,
  sumRefundsBetween,
  type CashPaymentRow,
  type CashReceivableRow,
} from "@/lib/db/repositories/cashReceipts";
import { currentMonthBr, monthLabel, shiftMonth } from "./month";

/** Caixa da oficina: o que ainda falta receber e o que entrou num período. Só leitura. */

export type CashPeriod = "hoje" | "semana" | "mes" | "mes-passado";

export const CASH_PERIODS: { id: CashPeriod; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "semana", label: "Últimos 7 dias" },
  { id: "mes", label: "Este mês" },
  { id: "mes-passado", label: "Mês passado" },
];

export function parseCashPeriod(value: string | undefined): CashPeriod {
  return CASH_PERIODS.some((p) => p.id === value) ? (value as CashPeriod) : "hoje";
}

function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00.000Z`).getTime() + days * 86400000).toISOString().slice(0, 10);
}

/** Intervalo [from, to) em dias de Brasília e o texto que descreve o período. */
export function cashRange(period: CashPeriod, now: Date = new Date()): { from: string; to: string; label: string } {
  const today = now.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const month = currentMonthBr(now);
  if (period === "hoje") return { from: today, to: addDays(today, 1), label: "Hoje" };
  if (period === "semana") return { from: addDays(today, -6), to: addDays(today, 1), label: "Últimos 7 dias (com hoje)" };
  if (period === "mes") return { from: `${month}-01`, to: `${shiftMonth(month, 1)}-01`, label: monthLabel(month) };
  const previous = shiftMonth(month, -1);
  return { from: `${previous}-01`, to: `${month}-01`, label: monthLabel(previous) };
}

export interface CashSummary {
  period: CashPeriod;
  label: string;
  receivables: CashReceivableRow[];
  receivablesTotalCents: number;
  payments: CashPaymentRow[];
  /** Valor dos serviços recebidos por forma de pagamento (sem a taxa repassada). */
  byMethod: { DINHEIRO: number; PIX: number; CARTAO: number; OUTRO: number };
  totalReceivedCents: number;
  /** Taxa da maquininha repassada ao cliente (à parte do valor dos serviços). */
  cardFeePassedCents: number;
  /** Estornos feitos no período. */
  refundsCents: number;
}

export async function getCashSummaryService(period: CashPeriod, now: Date = new Date()): Promise<CashSummary> {
  const range = cashRange(period, now);
  const [receivables, payments, refundsCents] = await Promise.all([
    listCashReceivables(),
    listPaymentsBetween(range.from, range.to),
    sumRefundsBetween(range.from, range.to),
  ]);
  const byMethod = { DINHEIRO: 0, PIX: 0, CARTAO: 0, OUTRO: 0 };
  let cardFeePassedCents = 0;
  for (const p of payments) {
    byMethod[p.method] += p.amountCents;
    cardFeePassedCents += p.cardFeeCents ?? 0;
  }
  return {
    period,
    label: range.label,
    receivables,
    receivablesTotalCents: receivables.reduce((s, r) => s + r.balanceCents, 0),
    payments,
    byMethod,
    totalReceivedCents: payments.reduce((s, p) => s + p.amountCents, 0),
    cardFeePassedCents,
    refundsCents,
  };
}
