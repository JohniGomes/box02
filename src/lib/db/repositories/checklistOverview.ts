import { pool } from "../pool";

export interface ChecklistProgress {
  /** Existe uma instância de checklist desse tipo nesta OS? */
  started: boolean;
  completed: boolean;
  checked: number;
  total: number;
}

export interface ChecklistOverviewRow {
  workOrderId: string;
  number: string;
  status: string;
  customer: string | null;
  plate: string | null;
  vehicle: string | null;
  createdAt: Date;
  entry: ChecklistProgress;
  delivery: ChecklistProgress;
}

/** Janela: OS dos últimos N dias (mesma das pendências do Início). */
const WINDOW_DAYS = 60;

/**
 * Visão de checklists por OS (entrada e entrega): se foi iniciado, quantos
 * itens já foram marcados e se foi concluído. Alimenta a aba Checklists, que
 * lista o que está pendente para fazer rápido no celular.
 */
export async function listChecklistOverview(): Promise<ChecklistOverviewRow[]> {
  const result = await pool.query(`
    SELECT
      wo.id, wo.number, wo.status, wo."customerNameSnapshot" AS customer,
      wo."vehiclePlateSnapshot" AS plate, wo."vehicleDescriptionSnapshot" AS vehicle, wo."createdAt",
      e.id AS entry_id, e."completedAt" AS entry_done,
      COALESCE((SELECT COUNT(*) FROM work_order_checklist_items i WHERE i."workOrderChecklistId" = e.id AND i.checked), 0) AS entry_checked,
      COALESCE((SELECT COUNT(*) FROM work_order_checklist_items i WHERE i."workOrderChecklistId" = e.id), 0) AS entry_total,
      g.id AS delivery_id, g."completedAt" AS delivery_done,
      COALESCE((SELECT COUNT(*) FROM work_order_checklist_items i WHERE i."workOrderChecklistId" = g.id AND i.checked), 0) AS delivery_checked,
      COALESCE((SELECT COUNT(*) FROM work_order_checklist_items i WHERE i."workOrderChecklistId" = g.id), 0) AS delivery_total
    FROM work_orders wo
    LEFT JOIN LATERAL (
      SELECT id, "completedAt" FROM work_order_checklists c
      WHERE c."workOrderId" = wo.id AND c.type = 'ENTRADA' ORDER BY c."startedAt" LIMIT 1
    ) e ON true
    LEFT JOIN LATERAL (
      SELECT id, "completedAt" FROM work_order_checklists c
      WHERE c."workOrderId" = wo.id AND c.type = 'ENTREGA' ORDER BY c."startedAt" LIMIT 1
    ) g ON true
    WHERE wo.status <> 'CANCELADA' AND wo."createdAt" >= now() - interval '${WINDOW_DAYS} days'
    ORDER BY wo."createdAt" DESC
  `);

  return result.rows.map((r) => ({
    workOrderId: r.id,
    number: r.number,
    status: r.status,
    customer: r.customer,
    plate: r.plate,
    vehicle: r.vehicle,
    createdAt: r.createdAt,
    entry: {
      started: r.entry_id !== null,
      completed: r.entry_done !== null,
      checked: Number(r.entry_checked),
      total: Number(r.entry_total),
    },
    delivery: {
      started: r.delivery_id !== null,
      completed: r.delivery_done !== null,
      checked: Number(r.delivery_checked),
      total: Number(r.delivery_total),
    },
  }));
}
