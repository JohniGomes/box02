import { pool } from "../pool";
import { BALANCE_SQL } from "./workOrders";

/** OS entregues com saldo a receber, da mais antiga para a mais nova (com placa e valor devido). */
export interface CashReceivableRow {
  id: string;
  number: string;
  customerName: string;
  plate: string | null;
  deliveredAt: Date | null;
  dueCents: number;
  balanceCents: number;
}

export async function listCashReceivables(limit = 200): Promise<CashReceivableRow[]> {
  const result = await pool.query<CashReceivableRow>(
    `SELECT * FROM (
       SELECT wo.id, wo.number, c."legalName" AS "customerName", wo."vehiclePlateSnapshot" AS plate, wo."deliveredAt",
              COALESCE((SELECT cl."totalAtClosureCents" FROM work_order_closures cl
                        WHERE cl."workOrderId" = wo.id ORDER BY cl."closedAt" DESC LIMIT 1), 0)::int AS "dueCents",
              ${BALANCE_SQL} AS "balanceCents"
       FROM work_orders wo
       INNER JOIN customers c ON c.id = wo."customerId"
       WHERE wo.status = 'ENTREGUE'
     ) t
     WHERE t."balanceCents" > 0
     ORDER BY t."deliveredAt" ASC NULLS LAST, t.number ASC
     LIMIT $1`,
    [limit],
  );
  return result.rows;
}

export interface CashPaymentRow {
  id: string;
  receivedAt: Date;
  method: "DINHEIRO" | "PIX" | "CARTAO" | "OUTRO";
  /** Valor DO SERVIÇO recebido. */
  amountCents: number;
  cardFeeCents: number | null;
  installments: number | null;
  refundedCents: number;
  workOrderId: string;
  number: string;
  customerName: string;
  plate: string | null;
}

/**
 * Recebimentos cujo dia (horário de Brasília) cai em [from, to): datas "AAAA-MM-DD", `to` não incluso.
 * Mais recente primeiro.
 */
export async function listPaymentsBetween(from: string, to: string): Promise<CashPaymentRow[]> {
  const result = await pool.query<CashPaymentRow>(
    `SELECT p.id, p."receivedAt", p.method, p."amountCents", p."cardFeeCents", p.installments,
            COALESCE((SELECT SUM(r."refundCents") FROM work_order_payment_refunds r WHERE r."paymentId" = p.id), 0)::int AS "refundedCents",
            wo.id AS "workOrderId", wo.number, c."legalName" AS "customerName", wo."vehiclePlateSnapshot" AS plate
     FROM work_order_payments p
     JOIN work_orders wo ON wo.id = p."workOrderId"
     JOIN customers c ON c.id = wo."customerId"
     WHERE ((p."receivedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo') >= $1::date
       AND ((p."receivedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo') < $2::date
     ORDER BY p."receivedAt" DESC, p."createdAt" DESC`,
    [from, to],
  );
  return result.rows;
}

/** Estornos feitos no período (soma), no mesmo critério de dia (Brasília) do Financeiro. */
export async function sumRefundsBetween(from: string, to: string): Promise<number> {
  const result = await pool.query<{ cents: string }>(
    `SELECT COALESCE(SUM("refundCents"), 0) AS cents FROM work_order_payment_refunds
     WHERE (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo') >= $1::date
       AND (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo') < $2::date`,
    [from, to],
  );
  return Number(result.rows[0].cents);
}
