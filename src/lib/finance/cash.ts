import {
  listCashReceivables,
  listPaymentsBetween,
  searchCashOrders,
  sumRefundsBetween,
  type CashOrderRow,
  type CashPaymentRow,
  type CashReceivableRow,
} from "@/lib/db/repositories/cashReceipts";
import { currentMonthBr, monthLabel, shiftMonth } from "./month";

/** Caixa da oficina: o que ainda falta receber e o que entrou num período. Só leitura. */

export type CashPeriod = "hoje" | "semana" | "mes" | "mes-passado" | "tudo" | "personalizado";

/** Atalhos mostrados na tela; "personalizado" nasce dos campos De/Até. */
export const CASH_PERIODS: { id: CashPeriod; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "semana", label: "Últimos 7 dias" },
  { id: "mes", label: "Este mês" },
  { id: "mes-passado", label: "Mês passado" },
  { id: "tudo", label: "Tudo" },
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string | undefined): value is string {
  return !!value && ISO_DATE.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime());
}

/** Período e datas pedidos na tela: "De/Até" válidos viram "personalizado"; qualquer outra coisa cai em "hoje". */
export function parseCashPeriod(
  value: string | undefined,
  from?: string,
  to?: string,
): { period: CashPeriod; custom?: { from: string; to: string } } {
  if (isRealDate(from) && isRealDate(to)) {
    return from <= to ? { period: "personalizado", custom: { from, to } } : { period: "personalizado", custom: { from: to, to: from } };
  }
  const known = CASH_PERIODS.find((p) => p.id === value);
  return { period: known ? known.id : "hoje" };
}

function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00.000Z`).getTime() + days * 86400000).toISOString().slice(0, 10);
}

function brDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** Intervalo [from, to) em dias de Brasília e o texto que descreve o período. */
export function cashRange(
  period: CashPeriod,
  now: Date = new Date(),
  custom?: { from: string; to: string },
): { from: string; to: string; label: string } {
  const today = now.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const month = currentMonthBr(now);
  if (period === "hoje") return { from: today, to: addDays(today, 1), label: "Hoje" };
  if (period === "semana") return { from: addDays(today, -6), to: addDays(today, 1), label: "Últimos 7 dias (com hoje)" };
  if (period === "mes") return { from: `${month}-01`, to: `${shiftMonth(month, 1)}-01`, label: monthLabel(month) };
  if (period === "tudo") return { from: "1900-01-01", to: "2200-01-01", label: "Todos os recebimentos" };
  if (period === "personalizado" && custom) {
    return { from: custom.from, to: addDays(custom.to, 1), label: `De ${brDate(custom.from)} a ${brDate(custom.to)}` };
  }
  const previous = shiftMonth(month, -1);
  return { from: `${previous}-01`, to: `${month}-01`, label: monthLabel(previous) };
}

export interface CashSummary {
  period: CashPeriod;
  label: string;
  /** Texto buscado (número da OS, cliente ou placa), quando há. */
  query: string;
  /** OS entregues que combinam com a busca (quitadas ou não); vazio sem busca. */
  orders: CashOrderRow[];
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

export async function getCashSummaryService(
  period: CashPeriod,
  now: Date = new Date(),
  options: { custom?: { from: string; to: string }; q?: string } = {},
): Promise<CashSummary> {
  const range = cashRange(period, now, options.custom);
  const query = (options.q ?? "").trim();
  const q = query || undefined;
  const [receivables, payments, refundsCents, orders] = await Promise.all([
    listCashReceivables(200, q),
    listPaymentsBetween(range.from, range.to, q),
    sumRefundsBetween(range.from, range.to, q),
    q ? searchCashOrders(q) : Promise.resolve([] as CashOrderRow[]),
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
    query,
    orders,
    receivables,
    receivablesTotalCents: receivables.reduce((s, r) => s + r.balanceCents, 0),
    payments,
    byMethod,
    totalReceivedCents: payments.reduce((s, p) => s + p.amountCents, 0),
    cardFeePassedCents,
    refundsCents,
  };
}
