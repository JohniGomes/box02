import { pool } from "../pool";

/**
 * KPIs da home do dashboard. Uma única query agregada (subqueries
 * escalares) em vez de várias chamadas separadas — evita N round-trips
 * ao banco só para montar um resumo.
 *
 * "Mês"/"hoje" são calculados no próprio Postgres, SEMPRE no horário de
 * Brasília. As colunas de data são `timestamp` sem fuso e guardam o relógio
 * UTC (default CURRENT_TIMESTAMP do banco e `new Date()` do servidor), então
 * cada coluna é convertida de UTC para Brasília antes de comparar. Sem isso,
 * a partir das 21h (meia-noite UTC) o "hoje" virava o dia seguinte e um
 * pagamento do próprio dia deixava de aparecer em "Entradas hoje".
 */
export interface SalesByMethod {
  dinheiroCents: number;
  pixCents: number;
  cartaoCents: number;
  outroCents: number;
}

export interface DashboardMetrics {
  totalCustomers: number;
  totalVehicles: number;
  openWorkOrders: number;
  awaitingPartWorkOrders: number;
  deliveredThisMonth: number;
  monthlyRevenueCents: number;
  monthlyExpensesCents: number;
  netResultCents: number;
  /** Pró-labore (categoria Salários/Pró-labore) pago no mês — já está dentro das saídas. */
  proLaboreCents: number;
  /** Resultado do mês sem contar o pró-labore. */
  resultBeforeProLaboreCents: number;
  averageTicketCents: number;
  pendingExpensesCents: number;
  /** Despesas não pagas que vencem no mês seguinte. */
  nextMonthExpensesCents: number;
  todayRevenueCents: number;
  todayExpensesCents: number;
  salesByMethodThisMonth: SalesByMethod;
  quotesThisMonthPending: number;
  quotesThisMonthApproved: number;
}

interface DashboardMetricsRow {
  total_customers: string;
  total_vehicles: string;
  open_work_orders: string;
  awaiting_part_work_orders: string;
  delivered_this_month: string;
  monthly_revenue_cents: string;
  monthly_refunds_cents: string;
  monthly_expenses_cents: string;
  monthly_pro_labore_cents: string;
  pending_expenses_cents: string;
  next_month_expenses_cents: string;
  paid_work_orders_this_month: string;
  today_revenue_cents: string;
  today_expenses_cents: string;
  sales_dinheiro_cents: string;
  sales_pix_cents: string;
  sales_cartao_cents: string;
  sales_outro_cents: string;
  quotes_this_month_pending: string;
  quotes_this_month_approved: string;
}

const TZ_BR = "America/Sao_Paulo";

/**
 * Monta a query. `nowExpr` existe só para teste (permite simular outro
 * instante); em produção é sempre `now()`.
 */
export function buildDashboardMetricsSql(nowExpr = "now()"): string {
  // Relógio de Brasília "de parede" (timestamp sem fuso).
  const localNow = `(${nowExpr} AT TIME ZONE '${TZ_BR}')`;
  const monthStart = `date_trunc('month', ${localNow})`;
  const nextMonth = `(${monthStart} + interval '1 month')`;
  const dayStart = `date_trunc('day', ${localNow})`;
  const nextDay = `(${dayStart} + interval '1 day')`;
  // Coluna guardada em UTC -> relógio de Brasília.
  const br = (col: string) => `((${col} AT TIME ZONE 'UTC') AT TIME ZONE '${TZ_BR}')`;

  const inMonth = (col: string) => `${br(col)} >= ${monthStart} AND ${br(col)} < ${nextMonth}`;
  const inToday = (col: string) => `${br(col)} >= ${dayStart} AND ${br(col)} < ${nextDay}`;

  return `
    SELECT
      (SELECT COUNT(*) FROM customers WHERE status = 'ATIVO') AS total_customers,
      (SELECT COUNT(*) FROM vehicles WHERE status = 'ATIVO') AS total_vehicles,
      (SELECT COUNT(*) FROM work_orders WHERE status NOT IN ('ENTREGUE', 'CANCELADA')) AS open_work_orders,
      (SELECT COUNT(*) FROM work_orders WHERE status = 'AGUARDANDO_PECA') AS awaiting_part_work_orders,
      (SELECT COUNT(*) FROM work_orders
        WHERE status = 'ENTREGUE' AND ${inMonth('"deliveredAt"')}
      ) AS delivered_this_month,
      (SELECT COALESCE(SUM("amountCents"), 0) FROM work_order_payments
        WHERE ${inMonth('"receivedAt"')}
      ) AS monthly_revenue_cents,
      (SELECT COALESCE(SUM("refundCents"), 0) FROM work_order_payment_refunds
        WHERE ${inMonth('"createdAt"')}
      ) AS monthly_refunds_cents,
      (SELECT COALESCE(SUM("amountCents"), 0) FROM expenses
        WHERE ${inMonth('"paidAt"')}
      ) AS monthly_expenses_cents,
      (SELECT COALESCE(SUM("amountCents"), 0) FROM expenses
        WHERE category = 'SALARIOS' AND ${inMonth('"paidAt"')}
      ) AS monthly_pro_labore_cents,
      (SELECT COALESCE(SUM("amountCents"), 0) FROM expenses
        WHERE "paidAt" IS NULL AND "dueDate" < (${nextMonth})::date
      ) AS pending_expenses_cents,
      (SELECT COALESCE(SUM("amountCents"), 0) FROM expenses
        WHERE "paidAt" IS NULL
          AND "dueDate" >= (${nextMonth})::date
          AND "dueDate" < ((${nextMonth}) + interval '1 month')::date
      ) AS next_month_expenses_cents,
      (SELECT COUNT(DISTINCT "workOrderId") FROM work_order_payments
        WHERE ${inMonth('"receivedAt"')}
      ) AS paid_work_orders_this_month,
      (SELECT COALESCE(SUM("amountCents"), 0) FROM work_order_payments
        WHERE ${inToday('"receivedAt"')}
      ) AS today_revenue_cents,
      (SELECT COALESCE(SUM("amountCents"), 0) FROM expenses
        WHERE ${inToday('"paidAt"')}
      ) AS today_expenses_cents,
      (SELECT COALESCE(SUM("amountCents"), 0) FROM work_order_payments
        WHERE method = 'DINHEIRO' AND ${inMonth('"receivedAt"')}
      ) AS sales_dinheiro_cents,
      (SELECT COALESCE(SUM("amountCents"), 0) FROM work_order_payments
        WHERE method = 'PIX' AND ${inMonth('"receivedAt"')}
      ) AS sales_pix_cents,
      (SELECT COALESCE(SUM("amountCents"), 0) FROM work_order_payments
        WHERE method = 'CARTAO' AND ${inMonth('"receivedAt"')}
      ) AS sales_cartao_cents,
      (SELECT COALESCE(SUM("amountCents"), 0) FROM work_order_payments
        WHERE method = 'OUTRO' AND ${inMonth('"receivedAt"')}
      ) AS sales_outro_cents,
      (SELECT COUNT(*) FROM quotes
        WHERE status IN ('RASCUNHO', 'ENVIADO') AND ${inMonth('"createdAt"')}
      ) AS quotes_this_month_pending,
      (SELECT COUNT(*) FROM quotes
        WHERE status IN ('APROVADO', 'APROVADO_PARCIAL') AND ${inMonth('"createdAt"')}
      ) AS quotes_this_month_approved
  `;
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const result = await pool.query<DashboardMetricsRow>(buildDashboardMetricsSql());

  const row = result.rows[0];
  const monthlyRevenueCents = Number(row.monthly_revenue_cents) - Number(row.monthly_refunds_cents);
  const monthlyExpensesCents = Number(row.monthly_expenses_cents);
  const proLaboreCents = Number(row.monthly_pro_labore_cents);
  const paidWorkOrdersThisMonth = Number(row.paid_work_orders_this_month);

  return {
    totalCustomers: Number(row.total_customers),
    totalVehicles: Number(row.total_vehicles),
    openWorkOrders: Number(row.open_work_orders),
    awaitingPartWorkOrders: Number(row.awaiting_part_work_orders),
    deliveredThisMonth: Number(row.delivered_this_month),
    monthlyRevenueCents,
    monthlyExpensesCents,
    netResultCents: monthlyRevenueCents - monthlyExpensesCents,
    proLaboreCents,
    resultBeforeProLaboreCents: monthlyRevenueCents - monthlyExpensesCents + proLaboreCents,
    averageTicketCents: paidWorkOrdersThisMonth > 0 ? Math.round(monthlyRevenueCents / paidWorkOrdersThisMonth) : 0,
    pendingExpensesCents: Number(row.pending_expenses_cents),
    nextMonthExpensesCents: Number(row.next_month_expenses_cents),
    todayRevenueCents: Number(row.today_revenue_cents),
    todayExpensesCents: Number(row.today_expenses_cents),
    salesByMethodThisMonth: {
      dinheiroCents: Number(row.sales_dinheiro_cents),
      pixCents: Number(row.sales_pix_cents),
      cartaoCents: Number(row.sales_cartao_cents),
      outroCents: Number(row.sales_outro_cents),
    },
    quotesThisMonthPending: Number(row.quotes_this_month_pending),
    quotesThisMonthApproved: Number(row.quotes_this_month_approved),
  };
}
