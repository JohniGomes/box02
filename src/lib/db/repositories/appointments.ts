import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";

export type AppointmentStatus = "AGENDADO" | "CANCELADO" | "COMPARECEU" | "NAO_COMPARECEU";

export interface AppointmentRecord {
  id: string;
  status: AppointmentStatus;
  customerId: string;
  vehicleId: string | null;
  scheduledAt: Date;
  description: string | null;
  createdByUserId: string;
  cancelledAt: Date | null;
  cancelReason: string | null;
  workOrderId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const COLUMNS = `
  id, status, "customerId", "vehicleId", "scheduledAt", description,
  "createdByUserId", "cancelledAt", "cancelReason", "workOrderId", "createdAt", "updatedAt"
`;

export async function createAppointment(
  input: {
    customerId: string;
    vehicleId?: string | null;
    scheduledAt: Date;
    description?: string | null;
    createdByUserId: string;
  },
): Promise<AppointmentRecord> {
  const id = createId();
  const result = await pool.query<AppointmentRecord>(
    `INSERT INTO appointments
      (id, "customerId", "vehicleId", "scheduledAt", description, "createdByUserId", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     RETURNING ${COLUMNS}`,
    [id, input.customerId, input.vehicleId ?? null, input.scheduledAt, input.description ?? null, input.createdByUserId],
  );
  return result.rows[0];
}

export async function findAppointmentById(id: string): Promise<AppointmentRecord | null> {
  const result = await pool.query<AppointmentRecord>(`SELECT ${COLUMNS} FROM appointments WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

/** Janela [from, to) — usada tanto pelo calendário do mês quanto pela
 * lista "hoje". */
export async function listAppointmentsBetween(from: Date, to: Date): Promise<AppointmentRecord[]> {
  const result = await pool.query<AppointmentRecord>(
    `SELECT ${COLUMNS} FROM appointments
     WHERE "scheduledAt" >= $1 AND "scheduledAt" < $2
     ORDER BY "scheduledAt" ASC`,
    [from, to],
  );
  return result.rows;
}

export interface AppointmentWithNames extends AppointmentRecord {
  customerName: string;
  vehiclePlate: string | null;
  vehicleDescription: string | null;
}

/** Mesma janela de `listAppointmentsBetween`, mas já com nome do
 * cliente/veículo — usada nas telas (calendário, lista), que nunca
 * precisam só do ID cru. */
export async function listAppointmentsWithNamesBetween(from: Date, to: Date): Promise<AppointmentWithNames[]> {
  const result = await pool.query<AppointmentWithNames>(
    `SELECT
       a.id, a.status, a."customerId", a."vehicleId", a."scheduledAt", a.description,
       a."createdByUserId", a."cancelledAt", a."cancelReason", a."workOrderId", a."createdAt", a."updatedAt",
       c."legalName" as "customerName",
       v.plate as "vehiclePlate",
       NULLIF(TRIM(CONCAT(v.brand, ' ', v.model)), '') as "vehicleDescription"
     FROM appointments a
     JOIN customers c ON c.id = a."customerId"
     LEFT JOIN vehicles v ON v.id = a."vehicleId"
     WHERE a."scheduledAt" >= $1 AND a."scheduledAt" < $2
     ORDER BY a."scheduledAt" ASC`,
    [from, to],
  );
  return result.rows;
}

export async function cancelAppointment(
  id: string,
  input: { cancelReason?: string | null },
): Promise<AppointmentRecord | null> {
  const result = await pool.query<AppointmentRecord>(
    `UPDATE appointments
     SET status = 'CANCELADO', "cancelledAt" = NOW(), "cancelReason" = $2, "updatedAt" = NOW()
     WHERE id = $1 AND status = 'AGENDADO'
     RETURNING ${COLUMNS}`,
    [id, input.cancelReason ?? null],
  );
  return result.rows[0] ?? null;
}

/** Corrige data/hora e descrição de um agendamento que ainda está AGENDADO. */
export async function updateAppointment(
  id: string,
  input: { scheduledAt: Date; description: string | null },
): Promise<AppointmentRecord | null> {
  const result = await pool.query<AppointmentRecord>(
    `UPDATE appointments SET "scheduledAt" = $2, description = $3, "updatedAt" = NOW()
     WHERE id = $1 AND status = 'AGENDADO'
     RETURNING ${COLUMNS}`,
    [id, input.scheduledAt, input.description],
  );
  return result.rows[0] ?? null;
}

/** Marca comparecimento (ou volta para AGENDADO). Cancelado não muda por aqui. */
export async function setAppointmentAttendance(
  id: string,
  status: "AGENDADO" | "COMPARECEU" | "NAO_COMPARECEU",
): Promise<AppointmentRecord | null> {
  const result = await pool.query<AppointmentRecord>(
    `UPDATE appointments SET status = $2, "updatedAt" = NOW()
     WHERE id = $1 AND status <> 'CANCELADO'
     RETURNING ${COLUMNS}`,
    [id, status],
  );
  return result.rows[0] ?? null;
}
