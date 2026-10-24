import {
  createServiceRequest,
  findServiceRequestById,
  listServiceRequests,
  markServiceRequestAttended,
  reopenServiceRequest,
  setServiceRequestStatus,
  type ServiceRequestRecord,
  type ServiceRequestStatus,
} from "@/lib/db/repositories/serviceRequests";
import { recordAuditLog } from "@/lib/db/repositories/auditLog";
import { createServiceRequestSchema } from "@/lib/validation/serviceRequest";
import { ServiceRequestNotAttendedError, ServiceRequestNotFoundError, ServiceRequestNotPendingError } from "./errors";
import { findCustomersByPhone, findCustomerById } from "@/lib/db/repositories/customers";
import { findVehicleByPlate, listVehiclesByCustomer } from "@/lib/db/repositories/vehicles";
import { createQuickCustomerService, createQuickVehicleService } from "@/lib/quickSale/service";
import { cancelAppointmentService, createAppointmentService } from "@/lib/appointments/service";
import { findAppointmentById } from "@/lib/db/repositories/appointments";
import { formatPlate, normalizePlate } from "@/lib/validation/plate";

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
    vehiclePlate: input.vehiclePlate ?? null,
    preferredTime: input.preferredTime ?? null,
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

// ============================================================
// Atender: transforma a solicitação em cliente + veículo + agendamento
// ============================================================

const PLATE_IN_TEXT = /[A-Za-z]{3}-?\d[A-Za-z0-9]\d{2}/;

/** Placa da solicitação: o campo próprio ou, se vazio, uma placa digitada no texto do veículo. */
export function plateOfServiceRequest(r: { vehiclePlate: string | null; vehicleDescription: string | null }): string | null {
  if (r.vehiclePlate) return normalizePlate(r.vehiclePlate) || null;
  const m = r.vehicleDescription?.match(PLATE_IN_TEXT);
  return m ? normalizePlate(m[0]) : null;
}

/** Texto do veículo sem a placa (sobra o modelo/ano). */
export function modelOfServiceRequest(r: { vehicleDescription: string | null }): string | undefined {
  const text = (r.vehicleDescription ?? "")
    .replace(PLATE_IN_TEXT, "")
    .replace(/\bplaca\b/gi, "")
    .replace(/[,;]+\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,;:-]+|[\s,;:-]+$/g, "")
    .trim();
  return text || undefined;
}

export interface ServiceRequestMatches {
  request: ServiceRequestRecord;
  plate: string | null;
  /** Modelo/ano do veículo, sem a placa. */
  model: string | null;
  customers: { id: string; name: string; phone: string | null }[];
  /** Veículos ativos de cada cliente encontrado. */
  vehiclesByCustomer: Record<string, { id: string; label: string; plate: string | null }[]>;
  /** Se a placa já existe em algum cadastro: de quem é. */
  plateOwner: { vehicleId: string; customerId: string; customerName: string } | null;
}

/** O que já existe no cadastro para esta solicitação (por telefone e por placa). */
export async function previewServiceRequestMatchesService(serviceRequestId: string): Promise<ServiceRequestMatches> {
  const request = await findServiceRequestById(serviceRequestId);
  if (!request) throw new ServiceRequestNotFoundError(serviceRequestId);

  const found = (await findCustomersByPhone(request.customerPhone)).filter((c) => c.status === "ATIVO");
  const plate = plateOfServiceRequest(request);
  const byPlate = plate ? await findVehicleByPlate(plate) : null;

  const customerIds = new Set(found.map((c) => c.id));
  let plateOwner: ServiceRequestMatches["plateOwner"] = null;
  if (byPlate) {
    const owner = await findCustomerById(byPlate.customerId);
    plateOwner = { vehicleId: byPlate.id, customerId: byPlate.customerId, customerName: owner?.legalName ?? "outro cliente" };
    // O dono da placa também é candidato, mesmo que o telefone seja outro.
    if (owner && owner.status === "ATIVO" && !customerIds.has(owner.id)) {
      found.push(owner);
      customerIds.add(owner.id);
    }
  }

  const vehiclesByCustomer: ServiceRequestMatches["vehiclesByCustomer"] = {};
  for (const c of found) {
    const list = await listVehiclesByCustomer(c.id);
    vehiclesByCustomer[c.id] = list
      .filter((v) => v.status === "ATIVO")
      .map((v) => ({
        id: v.id,
        plate: v.plate,
        label: [v.plate ? formatPlate(v.plate) : "Sem placa", [v.brand, v.model].filter(Boolean).join(" ")].filter(Boolean).join(" — "),
      }));
  }

  return {
    request,
    plate,
    model: modelOfServiceRequest(request) ?? null,
    customers: found.map((c) => ({ id: c.id, name: c.legalName, phone: c.phone ?? c.whatsapp })),
    vehiclesByCustomer,
    plateOwner,
  };
}

export interface AttendServiceRequestInput {
  /** Cliente já cadastrado; sem isso, cadastra (ou reaproveita) pelo nome e telefone da solicitação. */
  customerId?: string;
  /** Id de um veículo do cliente, "NEW" (cadastrar com os dados da solicitação) ou "NONE". */
  vehicle: string;
  scheduledAt: string;
  description?: string;
}

export async function attendServiceRequestService(
  actorUserId: string,
  serviceRequestId: string,
  input: AttendServiceRequestInput,
): Promise<ServiceRequestRecord> {
  const request = await findServiceRequestById(serviceRequestId);
  if (!request) throw new ServiceRequestNotFoundError(serviceRequestId);
  if (request.status !== "PENDENTE") throw new ServiceRequestNotPendingError();

  // 1) cliente: o escolhido, ou cadastra/reaproveita pelo telefone
  let customerId = input.customerId;
  let createdCustomer = false;
  if (customerId) {
    const c = await findCustomerById(customerId);
    if (!c) throw new ServiceRequestNotFoundError(serviceRequestId);
  } else {
    const created = await createQuickCustomerService(actorUserId, { name: request.customerName, phone: request.customerPhone });
    customerId = created.customer.id;
    createdCustomer = !created.reused;
  }

  // 2) veículo
  let vehicleId: string | null = null;
  if (input.vehicle === "NEW") {
    const plate = plateOfServiceRequest(request) ?? undefined;
    const model = modelOfServiceRequest(request);
    if (plate || model) {
      const v = await createQuickVehicleService(actorUserId, { customerId, plate, model });
      vehicleId = v.vehicle.id;
    }
  } else if (input.vehicle && input.vehicle !== "NONE") {
    vehicleId = input.vehicle;
  }

  // 3) agendamento (o pedido do cliente vira a descrição, se não foi trocada)
  const appointment = await createAppointmentService(actorUserId, {
    customerId,
    vehicleId: vehicleId ?? undefined,
    scheduledAt: input.scheduledAt,
    description: input.description?.trim() || request.description,
  });

  const updated = await markServiceRequestAttended(serviceRequestId, { customerId, vehicleId, appointmentId: appointment.id }, actorUserId);
  if (!updated) throw new ServiceRequestNotPendingError();

  await recordAuditLog({
    userId: actorUserId,
    action: "SERVICE_REQUEST_ATTENDED",
    entityType: "service_request",
    entityId: serviceRequestId,
    metadata: { customerId, vehicleId, appointmentId: appointment.id, createdCustomer },
  });
  return updated;
}

/** Desfaz o atendimento: volta para pendente e cancela o agendamento criado (cadastros ficam). */
export async function undoServiceRequestAttendanceService(
  actorUserId: string,
  serviceRequestId: string,
): Promise<ServiceRequestRecord> {
  const request = await findServiceRequestById(serviceRequestId);
  if (!request) throw new ServiceRequestNotFoundError(serviceRequestId);
  if (request.status !== "ATENDIDA") throw new ServiceRequestNotAttendedError();

  if (request.appointmentId) {
    const appt = await findAppointmentById(request.appointmentId);
    if (appt && appt.status === "AGENDADO") {
      await cancelAppointmentService(appt.id, { cancelReason: "Atendimento da solicitação desfeito" });
    }
  }

  const reopened = await reopenServiceRequest(serviceRequestId);
  if (!reopened) throw new ServiceRequestNotAttendedError();

  await recordAuditLog({
    userId: actorUserId,
    action: "SERVICE_REQUEST_ATTENDANCE_UNDONE",
    entityType: "service_request",
    entityId: serviceRequestId,
    metadata: { appointmentId: request.appointmentId },
  });
  return reopened;
}
