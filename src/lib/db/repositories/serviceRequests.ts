import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";

export type ServiceRequestStatus = "PENDENTE" | "ATENDIDA" | "DESCARTADA";

export interface ServiceRequestRecord {
  id: string;
  customerName: string;
  customerPhone: string;
  vehicleDescription: string | null;
  vehiclePlate: string | null;
  preferredTime: string | null;
  description: string;
  status: ServiceRequestStatus;
  attendedByUserId: string | null;
  attendedAt: Date | null;
  customerId: string | null;
  vehicleId: string | null;
  appointmentId: string | null;
  createdAt: Date;
}

const COLUMNS = `id, "customerName", "customerPhone", "vehicleDescription", "vehiclePlate", "preferredTime", description, status, "attendedByUserId", "attendedAt", "customerId", "vehicleId", "appointmentId", "createdAt"`;

export interface CreateServiceRequestInput {
  customerName: string;
  customerPhone: string;
  vehicleDescription?: string | null;
  vehiclePlate?: string | null;
  preferredTime?: string | null;
  description: string;
}

export async function createServiceRequest(input: CreateServiceRequestInput): Promise<ServiceRequestRecord> {
  const id = createId();
  const result = await pool.query<ServiceRequestRecord>(
    `INSERT INTO service_requests (id, "customerName", "customerPhone", "vehicleDescription", "vehiclePlate", "preferredTime", description)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${COLUMNS}`,
    [id, input.customerName, input.customerPhone, input.vehicleDescription ?? null, input.vehiclePlate ?? null, input.preferredTime ?? null, input.description],
  );
  return result.rows[0];
}

export async function findServiceRequestById(id: string): Promise<ServiceRequestRecord | null> {
  const result = await pool.query<ServiceRequestRecord>(
    `SELECT ${COLUMNS} FROM service_requests WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function listServiceRequests(status?: ServiceRequestStatus): Promise<ServiceRequestRecord[]> {
  const result = await pool.query<ServiceRequestRecord>(
    `SELECT ${COLUMNS} FROM service_requests
     WHERE ($1::text IS NULL OR status = $1)
     ORDER BY "createdAt" DESC`,
    [status ?? null],
  );
  return result.rows;
}

export async function setServiceRequestStatus(
  id: string,
  status: ServiceRequestStatus,
  attendedByUserId: string | null,
): Promise<ServiceRequestRecord | null> {
  const result = await pool.query<ServiceRequestRecord>(
    `UPDATE service_requests SET
       status = $2,
       "attendedByUserId" = $3,
       "attendedAt" = CASE WHEN $2 = 'PENDENTE' THEN NULL ELSE NOW() END
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [id, status, attendedByUserId],
  );
  return result.rows[0] ?? null;
}

/** Marca como atendida e guarda o que foi usado/criado no atendimento. */
export async function markServiceRequestAttended(
  id: string,
  links: { customerId: string; vehicleId: string | null; appointmentId: string | null },
  attendedByUserId: string,
): Promise<ServiceRequestRecord | null> {
  const result = await pool.query<ServiceRequestRecord>(
    `UPDATE service_requests SET
       status = 'ATENDIDA', "attendedByUserId" = $2, "attendedAt" = NOW(),
       "customerId" = $3, "vehicleId" = $4, "appointmentId" = $5
     WHERE id = $1 AND status = 'PENDENTE'
     RETURNING ${COLUMNS}`,
    [id, attendedByUserId, links.customerId, links.vehicleId, links.appointmentId],
  );
  return result.rows[0] ?? null;
}

/** Volta a solicitação para pendente e solta as ligações. */
export async function reopenServiceRequest(id: string): Promise<ServiceRequestRecord | null> {
  const result = await pool.query<ServiceRequestRecord>(
    `UPDATE service_requests SET
       status = 'PENDENTE', "attendedByUserId" = NULL, "attendedAt" = NULL,
       "customerId" = NULL, "vehicleId" = NULL, "appointmentId" = NULL
     WHERE id = $1 AND status = 'ATENDIDA'
     RETURNING ${COLUMNS}`,
    [id],
  );
  return result.rows[0] ?? null;
}
