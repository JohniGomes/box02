import {
  cancelAppointment,
  createAppointment,
  findAppointmentById,
  listAppointmentsBetween,
  listAppointmentsWithNamesBetween,
  type AppointmentRecord,
  type AppointmentWithNames,
} from "@/lib/db/repositories/appointments";
import { findCustomerById } from "@/lib/db/repositories/customers";
import { findVehicleById } from "@/lib/db/repositories/vehicles";
import { createAppointmentSchema, cancelAppointmentSchema } from "@/lib/validation/appointment";
import {
  AppointmentAlreadyCancelledError,
  AppointmentCustomerNotFoundError,
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
