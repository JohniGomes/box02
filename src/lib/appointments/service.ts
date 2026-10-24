import {
  cancelAppointment,
  createAppointment,
  findAppointmentById,
  listAppointmentsBetween,
  linkAppointmentToWorkOrder,
  listAppointmentsWithNamesBetween,
  setAppointmentAttendance,
  updateAppointment,
  type AppointmentRecord,
  type AppointmentWithNames,
} from "@/lib/db/repositories/appointments";
import { findCustomerById } from "@/lib/db/repositories/customers";
import { findVehicleById } from "@/lib/db/repositories/vehicles";
import {
  appointmentAttendanceSchema,
  createAppointmentSchema,
  cancelAppointmentSchema,
  updateAppointmentSchema,
} from "@/lib/validation/appointment";
import {
  AppointmentAlreadyCancelledError,
  AppointmentCustomerNotFoundError,
  AppointmentNotEditableError,
  AppointmentNotFoundError,
  AppointmentVehicleNotOwnedByCustomerError,
} from "./errors";

export async function createAppointmentService(
  actorUserId: string,
  rawInput: unknown,
): Promise<AppointmentRecord> {
  const input = createAppointmentSchema.parse(rawInput);

  const customer = await findCustomerById(input.customerId);
  if (!customer) throw new AppointmentCustomerNotFoundError();

  if (input.vehicleId) {
    const vehicle = await findVehicleById(input.vehicleId);
    if (!vehicle || vehicle.customerId !== input.customerId) {
      throw new AppointmentVehicleNotOwnedByCustomerError();
    }
  }

  return createAppointment({
    customerId: input.customerId,
    vehicleId: input.vehicleId ?? null,
    scheduledAt: new Date(input.scheduledAt),
    description: input.description ?? null,
    createdByUserId: actorUserId,
  });
}

export async function cancelAppointmentService(
  appointmentId: string,
  rawInput: unknown,
): Promise<AppointmentRecord> {
  const input = cancelAppointmentSchema.parse(rawInput);

  const existing = await findAppointmentById(appointmentId);
  if (!existing) throw new AppointmentNotFoundError(appointmentId);
  if (existing.status === "CANCELADO") throw new AppointmentAlreadyCancelledError();

  const cancelled = await cancelAppointment(appointmentId, { cancelReason: input.cancelReason });
  if (!cancelled) throw new AppointmentNotFoundError(appointmentId);
  return cancelled;
}

/** Janela [from, to) — usada tanto pelo calendário do mês quanto pela
 * lista "hoje" na home. */
export async function listAppointmentsBetweenService(from: Date, to: Date): Promise<AppointmentRecord[]> {
  return listAppointmentsBetween(from, to);
}

export async function listAppointmentsWithNamesBetweenService(from: Date, to: Date): Promise<AppointmentWithNames[]> {
  return listAppointmentsWithNamesBetween(from, to);
}

/** Corrige data/hora e descrição (ex.: incluir a queixa) de um agendamento ainda agendado. */
/** Agendamento ainda sem OS (e não cancelado), para abrir a "Nova OS" já preenchida. */
export async function getAppointmentForWorkOrderService(appointmentId: string) {
  const a = await findAppointmentById(appointmentId);
  if (!a || a.status === "CANCELADO" || a.workOrderId) return null;
  const [customer, vehicle] = await Promise.all([
    findCustomerById(a.customerId),
    a.vehicleId ? findVehicleById(a.vehicleId) : Promise.resolve(null),
  ]);
  if (!customer) return null;
  return {
    id: a.id,
    customerId: customer.id,
    customerName: customer.legalName,
    vehicleId: vehicle?.id ?? null,
    description: a.description,
  };
}

/** Liga o agendamento à OS criada (e marca que compareceu). Não falha a criação da OS se não der. */
export async function linkAppointmentToWorkOrderService(appointmentId: string, workOrderId: string) {
  return linkAppointmentToWorkOrder(appointmentId, workOrderId);
}

export async function updateAppointmentService(appointmentId: string, rawInput: unknown): Promise<AppointmentRecord> {
  const input = updateAppointmentSchema.parse(rawInput);
  const existing = await findAppointmentById(appointmentId);
  if (!existing) throw new AppointmentNotFoundError(appointmentId);
  if (existing.status !== "AGENDADO") throw new AppointmentNotEditableError();

  const updated = await updateAppointment(appointmentId, {
    scheduledAt: new Date(input.scheduledAt),
    description: input.description ?? null,
  });
  if (!updated) throw new AppointmentNotEditableError();
  return updated;
}

/** Marca "compareceu" / "não compareceu" (ou desfaz, voltando para agendado). */
export async function setAppointmentAttendanceService(appointmentId: string, rawInput: unknown): Promise<AppointmentRecord> {
  const input = appointmentAttendanceSchema.parse(rawInput);
  const existing = await findAppointmentById(appointmentId);
  if (!existing) throw new AppointmentNotFoundError(appointmentId);
  if (existing.status === "CANCELADO") throw new AppointmentAlreadyCancelledError();

  const updated = await setAppointmentAttendance(appointmentId, input.status);
  if (!updated) throw new AppointmentNotFoundError(appointmentId);
  return updated;
}
