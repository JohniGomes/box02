import {
  createServiceRequest,
  findServiceRequestById,
  listServiceRequests,
  setServiceRequestStatus,
  type ServiceRequestRecord,
  type ServiceRequestStatus,
} from "@/lib/db/repositories/serviceRequests";
import { recordAuditLog } from "@/lib/db/repositories/auditLog";
import { createServiceRequestSchema } from "@/lib/validation/serviceRequest";
import { ServiceRequestNotFoundError } from "./errors";

/**
 * Pública — sem actor logado (cliente preenche sozinho, sem login).
 * Só cria o registro de solicitação; nunca cria Customer/Vehicle/WorkOrder
 * (isso é decisão de Carlos/Matheus na tela interna, olhando se o cliente
 * já existe).
 */
export async function createServiceRequestService(rawInput: unknown): Promise<ServiceRequestRecord> {
  const input = createServiceRequestSchema.parse(rawInput);

  const request = await createServiceRequest({
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    vehicleDescription: input.vehicleDescription ?? null,
    description: input.description,
  });

  await recordAuditLog({
    userId: null,
    action: "SERVICE_REQUEST_CREATED",
    entityType: "service_request",
    entityId: request.id,
    metadata: { customerName: request.customerName },
  });

  return request;
}

export async function listServiceRequestsService(status?: ServiceRequestStatus): Promise<ServiceRequestRecord[]> {
  return listServiceRequests(status);
}

export async function setServiceRequestStatusService(
  actorUserId: string,
  serviceRequestId: string,
  status: "ATENDIDA" | "DESCARTADA",
): Promise<ServiceRequestRecord> {
  const existing = await findServiceRequestById(serviceRequestId);
  if (!existing) throw new ServiceRequestNotFoundError(serviceRequestId);

  const updated = await setServiceRequestStatus(serviceRequestId, status, actorUserId);
  if (!updated) throw new ServiceRequestNotFoundError(serviceRequestId);

  await recordAuditLog({
    userId: actorUserId,
    action: status === "ATENDIDA" ? "SERVICE_REQUEST_ATTENDED" : "SERVICE_REQUEST_DISCARDED",
    entityType: "service_request",
    entityId: serviceRequestId,
  });

  return updated;
}
