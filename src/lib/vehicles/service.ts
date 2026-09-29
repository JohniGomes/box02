import {
  createVehicle,
  findVehicleByPlate,
  findVehicleById,
  listVehiclesByCustomer,
  searchVehicles,
  setVehicleCustomer,
  setVehicleStatus,
  updateVehicle,
  type SearchVehiclesFilters,
  type VehicleRecord,
} from "@/lib/db/repositories/vehicles";
import { findCustomerById } from "@/lib/db/repositories/customers";
import { recordAuditLog } from "@/lib/db/repositories/auditLog";
import {
  normalizeVehicleInput,
  vehicleInputSchema,
  type VehicleInput,
} from "@/lib/validation/vehicle";
import {
  DuplicateVehiclePlateError,
  VehicleCustomerNotFoundError,
  VehicleNotFoundError,
} from "./errors";

async function assertCustomerExists(customerId: string) {
  const customer = await findCustomerById(customerId);
  if (!customer) throw new VehicleCustomerNotFoundError(customerId);
  return customer;
}

export async function createVehicleService(
  actorUserId: string,
  rawInput: unknown,
): Promise<VehicleRecord> {
  const parsed = vehicleInputSchema.parse(rawInput);
  const input = normalizeVehicleInput(parsed);

  await assertCustomerExists(input.customerId);

  if (input.plate) {
    const existing = await findVehicleByPlate(input.plate);
    if (existing) throw new DuplicateVehiclePlateError(input.plate);
  }

  const vehicle = await createVehicle(input);

  await recordAuditLog({
    userId: actorUserId,
    action: "VEHICLE_CREATED",
    entityType: "vehicle",
    entityId: vehicle.id,
    metadata: { customerId: vehicle.customerId },
  });

  return vehicle;
}

export async function updateVehicleService(
  actorUserId: string,
  vehicleId: string,
  rawInput: unknown,
): Promise<VehicleRecord> {
  const existing = await findVehicleById(vehicleId);
  if (!existing) throw new VehicleNotFoundError(vehicleId);

  const parsed = vehicleInputSchema.parse(rawInput);
  const input = normalizeVehicleInput(parsed);

  if (input.plate && input.plate !== existing.plate) {
    const plateOwner = await findVehicleByPlate(input.plate);
    if (plateOwner && plateOwner.id !== vehicleId) {
      throw new DuplicateVehiclePlateError(input.plate);
    }
  }

  const updated = await updateVehicle(vehicleId, input);
  if (!updated) throw new VehicleNotFoundError(vehicleId);

  await recordAuditLog({
    userId: actorUserId,
    action: "VEHICLE_UPDATED",
    entityType: "vehicle",
    entityId: vehicleId,
  });

  return updated;
}

export async function inactivateVehicleService(
  actorUserId: string,
  vehicleId: string,
): Promise<VehicleRecord> {
  const existing = await findVehicleById(vehicleId);
  if (!existing) throw new VehicleNotFoundError(vehicleId);

  const updated = await setVehicleStatus(vehicleId, "INATIVO");
  if (!updated) throw new VehicleNotFoundError(vehicleId);

  await recordAuditLog({
    userId: actorUserId,
    action: "VEHICLE_INACTIVATED",
    entityType: "vehicle",
    entityId: vehicleId,
  });

  return updated;
}

export async function reactivateVehicleService(
  actorUserId: string,
  vehicleId: string,
): Promise<VehicleRecord> {
  const existing = await findVehicleById(vehicleId);
  if (!existing) throw new VehicleNotFoundError(vehicleId);

  const updated = await setVehicleStatus(vehicleId, "ATIVO");
  if (!updated) throw new VehicleNotFoundError(vehicleId);

  await recordAuditLog({
    userId: actorUserId,
    action: "VEHICLE_REACTIVATED",
    entityType: "vehicle",
    entityId: vehicleId,
  });

  return updated;
}

/**
 * Transfere o veículo para outro cliente. Não apaga nada do histórico
 * anterior: o vínculo antigo fica registrado em audit_logs (ação
 * VEHICLE_TRANSFERRED, com fromCustomerId/toCustomerId). Ver nota no
 * schema.prisma sobre por que não há uma tabela extra de histórico de
 * propriedade.
 */
export async function transferVehicleService(
  actorUserId: string,
  vehicleId: string,
  newCustomerId: string,
): Promise<VehicleRecord> {
  const existing = await findVehicleById(vehicleId);
  if (!existing) throw new VehicleNotFoundError(vehicleId);

  await assertCustomerExists(newCustomerId);

  if (existing.customerId === newCustomerId) {
    return existing;
  }

  const updated = await setVehicleCustomer(vehicleId, newCustomerId);
  if (!updated) throw new VehicleNotFoundError(vehicleId);

  await recordAuditLog({
    userId: actorUserId,
    action: "VEHICLE_TRANSFERRED",
    entityType: "vehicle",
    entityId: vehicleId,
    metadata: { fromCustomerId: existing.customerId, toCustomerId: newCustomerId },
  });

  return updated;
}

export async function getVehicleService(vehicleId: string): Promise<VehicleRecord | null> {
  return findVehicleById(vehicleId);
}

export async function listVehiclesByCustomerService(customerId: string) {
  return listVehiclesByCustomer(customerId);
}

export async function searchVehiclesService(filters: SearchVehiclesFilters) {
  return searchVehicles(filters);
}

/**
 * D-OS-6 — chamada pelo check-in da OS. Atualiza `vehicles.mileage`
 * SOMENTE se a quilometragem informada for maior que a atual — nunca
 * reduz. Não lança erro quando a quilometragem informada é menor: só não
 * atualiza (a OS que chamou isso mantém sua própria `mileageAtEntry`
 * congelada de qualquer forma, independente do resultado aqui).
 */
export async function bumpVehicleMileageIfHigherService(
  actorUserId: string,
  vehicleId: string,
  newMileage: number,
): Promise<{ updated: boolean; vehicle: VehicleRecord }> {
  const existing = await findVehicleById(vehicleId);
  if (!existing) throw new VehicleNotFoundError(vehicleId);

  if (existing.mileage !== null && newMileage <= existing.mileage) {
    return { updated: false, vehicle: existing };
  }

  const updated = await updateVehicle(vehicleId, { mileage: newMileage });
  if (!updated) throw new VehicleNotFoundError(vehicleId);

  await recordAuditLog({
    userId: actorUserId,
    action: "VEHICLE_MILEAGE_UPDATED_FROM_WORK_ORDER",
    entityType: "vehicle",
    entityId: vehicleId,
    metadata: { previousMileage: existing.mileage, newMileage },
  });

  return { updated: true, vehicle: updated };
}

export type { VehicleInput };
