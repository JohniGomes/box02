import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";
import { BALANCE_SQL } from "./workOrders";

export type MessageKind = "CONFIRMACAO" | "LEMBRETE" | "AVALIACAO" | "COBRANCA";

/** Registra que a mensagem foi enviada (ou pulada). Só se acrescenta. */
export async function createMessageLog(input: {
  kind: MessageKind;
  refId: string;
  action: "ENVIADA" | "PULADA";
  sentByUserId: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO message_log (id, kind, "refId", action, "sentByUserId") VALUES ($1, $2, $3, $4, $5)`,
    [createId(), input.kind, input.refId, input.action, input.sentByUserId],
  );
}

/** Quais destes itens já têm registro (enviada ou pulada) para o tipo de mensagem. */
export async function listLoggedRefIds(kind: MessageKind, refIds: string[]): Promise<Set<string>> {
  if (refIds.length === 0) return new Set();
  const result = await pool.query<{ refId: string }>(
    `SELECT DISTINCT "refId" FROM message_log WHERE kind = $1 AND "refId" = ANY($2::text[])`,
    [kind, refIds],
  );
  return new Set(result.rows.map((r) => r.refId));
}

export interface AppointmentMessageRow {
  id: string;
  scheduledAt: Date;
  description: string | null;
  customerName: string;
  customerPhone: string | null;
  vehicleDescription: string | null;
}

/** Agendamentos ativos na janela [from, to), com o telefone do cliente. */
export async function listAppointmentsForMessages(from: Date, to: Date): Promise<AppointmentMessageRow[]> {
  const result = await pool.query<AppointmentMessageRow>(
    `SELECT a.id, a."scheduledAt", a.description, c."legalName" AS "customerName",
            COALESCE(NULLIF(c.whatsapp, ''), NULLIF(c.phone, '')) AS "customerPhone",
            NULLIF(TRIM(CONCAT(v.brand, ' ', v.model)), '') AS "vehicleDescription"
     FROM appointments a
     JOIN customers c ON c.id = a."customerId"
     LEFT JOIN vehicles v ON v.id = a."vehicleId"
     WHERE a.status = 'AGENDADO' AND a."scheduledAt" >= $1 AND a."scheduledAt" < $2
     ORDER BY a."scheduledAt" ASC`,
    [from, to],
  );
  return result.rows;
}

export interface DeliveredMessageRow {
  id: string;
  number: string;
  deliveredAt: Date | null;
  customerName: string;
  customerPhone: string | null;
  vehicleDescription: string | null;
  balanceCents: number;
}

/** OS entregues desde `since`, com telefone do cliente e saldo a receber. */
export async function listDeliveredForMessages(since: Date): Promise<DeliveredMessageRow[]> {
  const result = await pool.query<DeliveredMessageRow>(
    `SELECT wo.id, wo.number, wo."deliveredAt", c."legalName" AS "customerName",
            COALESCE(NULLIF(c.whatsapp, ''), NULLIF(c.phone, '')) AS "customerPhone",
            NULLIF(TRIM(CONCAT(v.brand, ' ', v.model)), '') AS "vehicleDescription",
            COALESCE(${BALANCE_SQL}, 0) AS "balanceCents"
     FROM work_orders wo
     JOIN customers c ON c.id = wo."customerId"
     JOIN vehicles v ON v.id = wo."vehicleId"
     WHERE wo.status = 'ENTREGUE' AND wo."deliveredAt" >= $1
     ORDER BY wo."deliveredAt" ASC`,
    [since],
  );
  return result.rows;
}

/** OS entregues com saldo a receber (qualquer data). */
export async function listReceivablesForMessages(): Promise<DeliveredMessageRow[]> {
  const result = await pool.query<DeliveredMessageRow>(
    `SELECT * FROM (
       SELECT wo.id, wo.number, wo."deliveredAt", c."legalName" AS "customerName",
              COALESCE(NULLIF(c.whatsapp, ''), NULLIF(c.phone, '')) AS "customerPhone",
              NULLIF(TRIM(CONCAT(v.brand, ' ', v.model)), '') AS "vehicleDescription",
              COALESCE(${BALANCE_SQL}, 0) AS "balanceCents"
       FROM work_orders wo
       JOIN customers c ON c.id = wo."customerId"
       JOIN vehicles v ON v.id = wo."vehicleId"
       WHERE wo.status = 'ENTREGUE'
     ) t WHERE t."balanceCents" > 0
     ORDER BY t."deliveredAt" ASC NULLS LAST`,
  );
  return result.rows;
}
