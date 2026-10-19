import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";

export type ServiceRequestStatus = "PENDENTE" | "ATENDIDA" | "DESCARTADA";

export interface ServiceRequestRecord {
  id: string;
  customerName: string;
  customerPhone: string;
  vehicleDescription: string | null;
  description: string;
  status: ServiceRequestStatus;
  attendedByUserId: string | null;
  attendedAt: Date | null;
  createdAt: Date;
}

const COLUMNS = `id, "customerName", "customerPhone", "vehicleDescription", description, status, "attendedByUserId", "attendedAt", "createdAt"`;

export interface CreateServiceRequestInput {
  customerName: string;
  customerPhone: string;
  vehicleDescription?: string | null;
  description: string;
}

export async function createServiceRequest(input: CreateServiceRequestInput): Promise<ServiceRequestRecord> {
  const id = createId();
  const result = await pool.query<ServiceRequestRecord>(
    `INSERT INTO service_requests (id, "customerName", "customerPhone", "vehicleDescription", description)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLUMNS}`,
    [id, input.customerName, input.customerPhone, input.vehicleDescription ?? null, input.description],
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
