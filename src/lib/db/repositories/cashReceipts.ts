import { pool } from "../pool";
import { BALANCE_SQL } from "./workOrders";
import { NORM } from "./serviceHistory";

/** Texto da busca sem acento e em minúscula; a placa é comparada sem hífen nem espaço. */
function searchPatterns(q: string | undefined): { text: string | null; plate: string | null } {
  const text = (q ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  if (!text) return { text: null, plate: null };
  const plate = text.replace(/[^a-z0-9]/g, "");
  return { text: `%${text.replace(/[\\%_]/g, "\\$&")}%`, plate: plate ? `%${plate}%` : null };
}

/** Condição SQL (parâmetros $a = texto, $b = placa) para número da OS, nome do cliente ou placa. */
function searchWhere(a: number, b: number): string {
  return `(${NORM("wo.number")} LIKE $${a} OR ${NORM('c."legalName"')} LIKE $${a}
     OR ($${b}::text IS NOT NULL AND lower(coalesce(wo."vehiclePlateSnapshot", '')) LIKE $${b}))`;
}

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

export async function listCashReceivables(limit = 200, q?: string): Promise<CashReceivableRow[]> {
  const s = searchPatterns(q);
  const result = await pool.query<CashReceivableRow>(
    `SELECT * FROM (
       SELECT wo.id, wo.number, c."legalName" AS "customerName", wo."vehiclePlateSnapshot" AS plate, wo."deliveredAt",
              COALESCE((SELECT cl."totalAtClosureCents" FROM work_order_closures cl
                        WHERE cl."workOrderId" = wo.id ORDER BY cl."closedAt" DESC LIMIT 1), 0)::int AS "dueCents",
              ${BALANCE_SQL} AS "balanceCents"
       FROM work_orders wo
       INNER JOIN customers c ON c.id = wo."customerId"
       WHERE wo.status = 'ENTREGUE'
         AND ($2::text IS NULL OR ${searchWhere(2, 3)})
     ) t
     WHERE t."balanceCents" > 0
     ORDER BY t."deliveredAt" ASC NULLS LAST, t.number ASC
     LIMIT $1`,
    [limit, s.text, s.plate],
  );
  return result.rows;
}

/** OS entregues que combinam com a busca (quitadas ou não), da mais recente para a mais antiga. */
export interface CashOrderRow extends CashReceivableRow {
  paidCents: number;
}

export async function searchCashOrders(q: string, limit = 30): Promise<CashOrderRow[]> {
  const s = searchPatterns(q);
  if (!s.text) return [];
  const result = await pool.query<CashOrderRow>(
    `SELECT wo.id, wo.number, c."legalName" AS "customerName", wo."vehiclePlateSnapshot" AS plate, wo."deliveredAt",
            COALESCE((SELECT cl."totalAtClosureCents" FROM work_order_closures cl
                      WHERE cl."workOrderId" = wo.id ORDER BY cl."closedAt" DESC LIMIT 1), 0)::int AS "dueCents",
            ${BALANCE_SQL} AS "balanceCents",
            COALESCE((SELECT SUM(p."amountCents") FROM work_order_payments p WHERE p."workOrderId" = wo.id), 0)::int
              - COALESCE((SELECT SUM(r."refundCents") FROM work_order_payment_refunds r
                          JOIN work_order_payments p2 ON p2.id = r."paymentId" WHERE p2."workOrderId" = wo.id), 0)::int AS "paidCents"
     FROM work_orders wo
     INNER JOIN customers c ON c.id = wo."customerId"
     WHERE wo.status = 'ENTREGUE' AND ${searchWhere(2, 3)}
     ORDER BY wo."deliveredAt" DESC NULLS LAST, wo.number DESC
     LIMIT $1`,
    [limit, s.text, s.plate],
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
 * Mais recente primeiro. Com `q`, só os da OS/cliente/placa que combinam com a busca.
 */
export async function listPaymentsBetween(from: string, to: string, q?: string): Promise<CashPaymentRow[]> {
  const s = searchPatterns(q);
  const result = await pool.query<CashPaymentRow>(
    `SELECT p.id, p."receivedAt", p.method, p."amountCents", p."cardFeeCents", p.installments,
            COALESCE((SELECT SUM(r."refundCents") FROM work_order_payment_refunds r WHERE r."paymentId" = p.id), 0)::int AS "refundedCents",
            wo.id AS "workOrderId", wo.number, c."legalName" AS "customerName", wo."vehiclePlateSnapshot" AS plate
     FROM work_order_payments p
     JOIN work_orders wo ON wo.id = p."workOrderId"
     JOIN customers c ON c.id = wo."customerId"
     WHERE ((p."receivedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo') >= $1::date
       AND ((p."receivedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo') < $2::date
       AND ($3::text IS NULL OR ${searchWhere(3, 4)})
     ORDER BY p."receivedAt" DESC, p."createdAt" DESC`,
    [from, to, s.text, s.plate],
  );
  return result.rows;
}

/** Estornos feitos no período (soma), no mesmo critério de dia (Brasília) do Financeiro. Com `q`, só da busca. */
export async function sumRefundsBetween(from: string, to: string, q?: string): Promise<number> {
  const s = searchPatterns(q);
  const result = await pool.query<{ cents: string }>(
    `SELECT COALESCE(SUM(rf."refundCents"), 0) AS cents
     FROM work_order_payment_refunds rf
     JOIN work_order_payments p ON p.id = rf."paymentId"
     JOIN work_orders wo ON wo.id = p."workOrderId"
     JOIN customers c ON c.id = wo."customerId"
     WHERE ((rf."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo') >= $1::date
       AND ((rf."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo') < $2::date
       AND ($3::text IS NULL OR ${searchWhere(3, 4)})`,
    [from, to, s.text, s.plate],
  );
  return Number(result.rows[0].cents);
}
