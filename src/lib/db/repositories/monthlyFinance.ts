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
  /** Recebido no cartão no mês SEM taxa repassada registrada: é a base da taxa estimada da maquininha. */
  cardNoFeeCents: number;
  /** Taxa da maquininha repassada ao cliente nos recebimentos do mês (fica fora das entradas). */
  cardFeePassedCents: number;
}

const BR = (col: string) => `((${col} AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')`;
const IN_MONTH = (col: string) => `${BR(col)} >= $1::timestamp AND ${BR(col)} < ($1::timestamp + interval '1 month')`;

export interface MonthMarginRaw {
  /** OS entregues no mês. */
  osCount: number;
  revenueCents: number;
  costCents: number;
  itemsWithoutCost: number;
  /** Pago no cartão (sem estornos) nas OS entregues no mês: base da taxa da maquininha. */
  cardPaidCents: number;
}

/** Margem das OS ENTREGUES no mês (pela data de entrega): itens executados menos descontos, e o custo gravado em cada item. */
export async function getMonthMarginRaw(month: string): Promise<MonthMarginRaw> {
  const r = await pool.query<{ n: string; revenue: string; cost: string; nocost: string; discounts: string; card_paid: string }>(
    `WITH wo AS (
       SELECT id FROM work_orders WHERE status = 'ENTREGUE' AND ${IN_MONTH('"deliveredAt"')}
     )
     SELECT
       (SELECT COUNT(*) FROM wo) AS n,
       COALESCE((SELECT SUM(i."totalCents") FROM work_order_items i JOIN wo ON wo.id = i."workOrderId" WHERE i.status = 'EXECUTADO'), 0) AS revenue,
       COALESCE((SELECT SUM(ROUND(i.quantity::numeric * COALESCE(i."unitCostCents", 0))) FROM work_order_items i JOIN wo ON wo.id = i."workOrderId" WHERE i.status = 'EXECUTADO'), 0) AS cost,
       (SELECT COUNT(*) FROM work_order_items i JOIN wo ON wo.id = i."workOrderId" WHERE i.status = 'EXECUTADO' AND i."unitCostCents" IS NULL) AS nocost,
       COALESCE((SELECT SUM(d."amountCents") FROM work_order_discounts d JOIN wo ON wo.id = d."workOrderId"), 0) AS discounts,
       COALESCE((SELECT SUM(p."amountCents") FROM work_order_payments p JOIN wo ON wo.id = p."workOrderId" WHERE p.method = 'CARTAO' AND p."cardFeeCents" IS NULL), 0)
       - COALESCE((SELECT SUM(r."refundCents") FROM work_order_payment_refunds r JOIN work_order_payments p ON p.id = r."paymentId" JOIN wo ON wo.id = p."workOrderId" WHERE p.method = 'CARTAO' AND p."cardFeeCents" IS NULL), 0) AS card_paid`,
    [`${month}-01`],
  );
  const row = r.rows[0];
  return {
    osCount: Number(row.n),
    revenueCents: Number(row.revenue) - Number(row.discounts),
    costCents: Number(row.cost),
    itemsWithoutCost: Number(row.nocost),
    cardPaidCents: Number(row.card_paid),
  };
}

/** `month` no formato "AAAA-MM" (já validado por quem chama). */
export async function getMonthFinanceRaw(month: string): Promise<MonthFinanceRaw> {
  const start = `${month}-01`;
  const [pay, ref, exp, unpaid, cardFee] = await Promise.all([
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
    pool.query<{ no_fee: string; passed: string }>(
      `SELECT
         COALESCE(SUM("amountCents") FILTER (WHERE method = 'CARTAO' AND "cardFeeCents" IS NULL), 0) AS no_fee,
         COALESCE(SUM("cardFeeCents"), 0) AS passed
       FROM work_order_payments WHERE ${IN_MONTH('"receivedAt"')}`,
      [start],
    ),
  ]);
  return {
    paymentsByMethod: Object.fromEntries(pay.rows.map((r) => [r.method, Number(r.cents)])),
    refundsCents: Number(ref.rows[0].cents),
    expensesByCategory: exp.rows.map((r) => ({ category: r.category, cents: Number(r.cents) })),
    unpaidDueCents: Number(unpaid.rows[0].cents),
    unpaidDueCount: Number(unpaid.rows[0].n),
    cardNoFeeCents: Number(cardFee.rows[0].no_fee),
    cardFeePassedCents: Number(cardFee.rows[0].passed),
  };
}
