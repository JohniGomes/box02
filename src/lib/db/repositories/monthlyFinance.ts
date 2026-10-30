import { pool } from "../pool";

/**
 * Números de UM mês (horário de Brasília), só leitura. Mesmas regras do Início:
 * colunas timestamp guardam UTC e são convertidas para Brasília antes de comparar;
 * entradas = pagamentos recebidos no mês menos estornos do mês; saídas = despesas PAGAS no mês.
 */
export interface MonthFinanceRaw {
  paymentsByMethod: Record<string, number>;
  refundsCents: number;
  expensesByCategory: { category: string; cents: number }[];
  /** Despesas ainda não pagas que vencem no mês. */
  unpaidDueCents: number;
  unpaidDueCount: number;
}

const BR = (col: string) => `((${col} AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')`;
const IN_MONTH = (col: string) => `${BR(col)} >= $1::timestamp AND ${BR(col)} < ($1::timestamp + interval '1 month')`;

/** `month` no formato "AAAA-MM" (já validado por quem chama). */
export async function getMonthFinanceRaw(month: string): Promise<MonthFinanceRaw> {
  const start = `${month}-01`;
  const [pay, ref, exp, unpaid] = await Promise.all([
    pool.query<{ method: string; cents: string }>(
      `SELECT method, COALESCE(SUM("amountCents"), 0) AS cents FROM work_order_payments WHERE ${IN_MONTH('"receivedAt"')} GROUP BY method`,
      [start],
    ),
    pool.query<{ cents: string }>(
      `SELECT COALESCE(SUM("refundCents"), 0) AS cents FROM work_order_payment_refunds WHERE ${IN_MONTH('"createdAt"')}`,
      [start],
    ),
    pool.query<{ category: string; cents: string }>(
      `SELECT category, COALESCE(SUM("amountCents"), 0) AS cents FROM expenses WHERE ${IN_MONTH('"paidAt"')} GROUP BY category ORDER BY cents DESC`,
      [start],
    ),
    pool.query<{ cents: string; n: string }>(
      `SELECT COALESCE(SUM("amountCents"), 0) AS cents, COUNT(*) AS n FROM expenses
       WHERE "paidAt" IS NULL AND "dueDate" >= $1::date AND "dueDate" < ($1::date + interval '1 month')::date`,
      [start],
    ),
  ]);
  return {
    paymentsByMethod: Object.fromEntries(pay.rows.map((r) => [r.method, Number(r.cents)])),
    refundsCents: Number(ref.rows[0].cents),
    expensesByCategory: exp.rows.map((r) => ({ category: r.category, cents: Number(r.cents) })),
    unpaidDueCents: Number(unpaid.rows[0].cents),
    unpaidDueCount: Number(unpaid.rows[0].n),
  };
}
