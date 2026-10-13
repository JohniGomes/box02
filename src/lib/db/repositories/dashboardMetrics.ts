import { pool } from "../pool";

/**
 * KPIs da home do dashboard. Uma única query agregada (subqueries
 * escalares) em vez de várias chamadas separadas — evita N round-trips
 * ao banco só para montar um resumo.
 *
 * "Mês"/"hoje" são sempre calculados no próprio Postgres (date_trunc,
 * CURRENT_DATE) para não depender do fuso horário do processo Node.
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
  averageTicketCents: number;
  pendingExpensesCents: number;
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
  pending_expenses_cents: string;
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

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const result = await pool.query<DashboardMetricsRow>(`
    SELECT
      (SELECT COUNT(*) FROM customers WHERE status = 'ATIVO') AS total_customers,
      (SELECT COUNT(*) FROM vehicles WHERE status = 'ATIVO') AS total_vehicles,
      (SELECT COUNT(*) FROM work_orders WHERE status NOT IN ('ENTREGUE', 'CANCELADA')) AS open_work_orders,
      (SELECT COUNT(*) FROM work_orders WHERE status = 'AGUARDANDO_PECA') AS awaiting_part_work_orders,
      (SELECT COUNT(*) FROM work_orders
        WHERE status = 'ENTREGUE'
          AND "deliveredAt" >= date_trunc('month', now())
          AND "deliveredAt" < date_trunc('month', now()) + interval '1 month'
      ) AS delivered_this_month,
      (SELECT COALESCE(SUM("amountCents"), 0) FROM work_order_payments
        WHERE "receivedAt" >= date_trunc('month', now())
          AND "receivedAt" < date_trunc('month', now()) + interval '1 month'
      ) AS monthly_revenue_cents,
      (SELECT COALESCE(SUM("refundCents"), 0) FROM work_order_payment_refunds
        WHERE "createdAt" >= date_trunc('month', now())
          AND "createdAt" < date_trunc('month', now()) + interval '1 month'
      ) AS monthly_refunds_cents,
      (SELECT COALESCE(SUM("amountCents"), 0) FROM expenses
        WHERE "paidAt" >= date_trunc('month', now())
          AND "paidAt" < date_trunc('month', now()) + interval '1 month'
      ) AS monthly_expenses_cents,
      (SELECT COALESCE(SUM("amountCents"), 0) FROM expenses WHERE "paidAt" IS NULL) AS pending_expenses_cents,
      (SELECT COUNT(DISTINCT "workOrderId") FROM work_order_payments
        WHERE "receivedAt" >= date_trunc('month', now())
          AND "receivedAt" < date_trunc('month', now()) + interval '1 month'
      ) AS paid_work_orders_this_month,
      (SELECT COALESCE(SUM("amountCents"), 0) FROM work_order_payments
        WHERE "receivedAt" >= CURRENT_DATE AND "receivedAt" < CURRENT_DATE + interval '1 day'
      ) AS today_revenue_cents,
      (SELECT COALESCE(SUM("amountCents"), 0) FROM expenses
        WHERE "paidAt" >= CURRENT_DATE AND "paidAt" < CURRENT_DATE + interval '1 day'
      ) AS today_expenses_cents,
      (SELECT COALESCE(SUM("amountCents"), 0) FROM work_order_payments
        WHERE method = 'DINHEIRO' AND "receivedAt" >= date_trunc('month', now())
          AND "receivedAt" < date_trunc('month', now()) + interval '1 month'
      ) AS sales_dinheiro_cents,
      (SELECT COALESCE(SUM("amountCents"), 0) FROM work_order_payments
        WHERE method = 'PIX' AND "receivedAt" >= date_trunc('month', now())
          AND "receivedAt" < date_trunc('month', now()) + interval '1 month'
      ) AS sales_pix_cents,
      (SELECT COALESCE(SUM("amountCents"), 0) FROM work_order_payments
        WHERE method = 'CARTAO' AND "receivedAt" >= date_trunc('month', now())
          AND "receivedAt" < date_trunc('month', now()) + interval '1 month'
      ) AS sales_cartao_cents,
      (SELECT COALESCE(SUM("amountCents"), 0) FROM work_order_payments
        WHERE method = 'OUTRO' AND "receivedAt" >= date_trunc('month', now())
          AND "receivedAt" < date_trunc('month', now()) + interval '1 month'
      ) AS sales_outro_cents,
      (SELECT COUNT(*) FROM quotes
        WHERE status IN ('RASCUNHO', 'ENVIADO')
          AND "createdAt" >= date_trunc('month', now())
          AND "createdAt" < date_trunc('month', now()) + interval '1 month'
      ) AS quotes_this_month_pending,
      (SELECT COUNT(*) FROM quotes
        WHERE status IN ('APROVADO', 'APROVADO_PARCIAL')
          AND "createdAt" >= date_trunc('month', now())
          AND "createdAt" < date_trunc('month', now()) + interval '1 month'
      ) AS quotes_this_month_approved
  `);

  const row = result.rows[0];
  const monthlyRevenueCents = Number(row.monthly_revenue_cents) - Number(row.monthly_refunds_cents);
  const monthlyExpensesCents = Number(row.monthly_expenses_cents);
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
    averageTicketCents: paidWorkOrdersThisMonth > 0 ? Math.round(monthlyRevenueCents / paidWorkOrdersThisMonth) : 0,
    pendingExpensesCents: Number(row.pending_expenses_cents),
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
