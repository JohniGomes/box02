import { pool } from "../pool";

/**
 * Alertas do Início: o que está esperando alguém fazer alguma coisa. Uma
 * única query (subqueries escalares), sempre calculada no Postgres e no
 * horário de Brasília para datas de vencimento.
 */
export interface HomeAlerts {
  pendingServiceRequests: number;
  expenses: {
    overdueCount: number;
    overdueCents: number;
    dueSoonCount: number;
    dueSoonCents: number;
  };
  stock: {
    activeParts: number;
    outOfStock: number;
    belowMinimum: number;
    valueCents: number;
  };
  workOrderPending: {
    withoutReception: number;
    withoutEntryChecklist: number;
    withoutDeliveryChecklist: number;
  };
}

/** Janela das pendências de OS: não vale cobrar termo de uma OS de meses atrás. */
const WORK_ORDER_WINDOW_DAYS = 60;
/** "Vence em breve" = hoje até daqui a N dias. */
const DUE_SOON_DAYS = 7;

export async function getHomeAlerts(): Promise<HomeAlerts> {
  const today = `(now() AT TIME ZONE 'America/Sao_Paulo')::date`;
  const recentOs = `wo.status <> 'CANCELADA' AND wo."createdAt" >= now() - interval '${WORK_ORDER_WINDOW_DAYS} days'`;

  const result = await pool.query(`
    WITH stock AS (
      SELECT p.id, p."costCents", p."minStock",
             COALESCE(SUM(CASE sm.type WHEN 'ENTRADA' THEN sm.quantity ELSE -sm.quantity END), 0) AS qty
      FROM parts p
      LEFT JOIN stock_movements sm ON sm."partId" = p.id
      WHERE p.status = 'ATIVO'
      GROUP BY p.id
    )
    SELECT
      (SELECT COUNT(*) FROM service_requests WHERE status = 'PENDENTE') AS pending_requests,

      (SELECT COUNT(*) FROM expenses WHERE "paidAt" IS NULL AND "dueDate" < ${today}) AS overdue_count,
      (SELECT COALESCE(SUM("amountCents"), 0) FROM expenses WHERE "paidAt" IS NULL AND "dueDate" < ${today}) AS overdue_cents,
      (SELECT COUNT(*) FROM expenses
        WHERE "paidAt" IS NULL AND "dueDate" >= ${today} AND "dueDate" <= ${today} + ${DUE_SOON_DAYS}) AS due_soon_count,
      (SELECT COALESCE(SUM("amountCents"), 0) FROM expenses
        WHERE "paidAt" IS NULL AND "dueDate" >= ${today} AND "dueDate" <= ${today} + ${DUE_SOON_DAYS}) AS due_soon_cents,

      (SELECT COUNT(*) FROM stock) AS active_parts,
      (SELECT COUNT(*) FROM stock WHERE qty <= 0) AS out_of_stock,
      (SELECT COUNT(*) FROM stock WHERE "minStock" IS NOT NULL AND qty > 0 AND qty <= "minStock") AS below_minimum,
      (SELECT COALESCE(SUM(qty * "costCents"), 0) FROM stock WHERE qty > 0 AND "costCents" IS NOT NULL) AS stock_value_cents,

      (SELECT COUNT(*) FROM work_orders wo WHERE ${recentOs} AND wo."receptionAcceptedAt" IS NULL) AS without_reception,
      (SELECT COUNT(*) FROM work_orders wo
        WHERE ${recentOs}
          AND NOT EXISTS (
            SELECT 1 FROM work_order_checklists c
            WHERE c."workOrderId" = wo.id AND c.type = 'ENTRADA' AND c."completedAt" IS NOT NULL
          )) AS without_entry_checklist,
      (SELECT COUNT(*) FROM work_orders wo
        WHERE ${recentOs} AND wo.status IN ('PRONTA', 'ENTREGUE')
          AND NOT EXISTS (
            SELECT 1 FROM work_order_checklists c
            WHERE c."workOrderId" = wo.id AND c.type = 'ENTREGA' AND c."completedAt" IS NOT NULL
          )) AS without_delivery_checklist
  `);

  const r = result.rows[0];
  return {
    pendingServiceRequests: Number(r.pending_requests),
    expenses: {
      overdueCount: Number(r.overdue_count),
      overdueCents: Number(r.overdue_cents),
      dueSoonCount: Number(r.due_soon_count),
      dueSoonCents: Number(r.due_soon_cents),
    },
    stock: {
      activeParts: Number(r.active_parts),
      outOfStock: Number(r.out_of_stock),
      belowMinimum: Number(r.below_minimum),
      valueCents: Number(r.stock_value_cents),
    },
    workOrderPending: {
      withoutReception: Number(r.without_reception),
      withoutEntryChecklist: Number(r.without_entry_checklist),
      withoutDeliveryChecklist: Number(r.without_delivery_checklist),
    },
  };
}
