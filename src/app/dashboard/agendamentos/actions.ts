"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/auth";
import {
  cancelAppointmentService,
  createAppointmentService,
  linkAppointmentToExistingWorkOrderService,
  listLinkableWorkOrdersService,
  setAppointmentAttendanceService,
  updateAppointmentService,
} from "@/lib/appointments/service";
import {
  AppointmentAlreadyCancelledError,
  AppointmentCustomerNotFoundError,
  AppointmentLinkError,
  AppointmentNotEditableError,
  AppointmentNotFoundError,
  AppointmentVehicleNotOwnedByCustomerError,
} from "@/lib/appointments/errors";

export interface ActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  appointmentId?: string;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Não autenticado.");
  }
  return session.user.id;
}

function toFieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_root";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

function mapKnownError(err: unknown, fallback: string): ActionResult {
  if (err instanceof ZodError) {
    return { success: false, error: "Existem campos inválidos.", fieldErrors: toFieldErrors(err) };
  }
  if (
    err instanceof AppointmentCustomerNotFoundError ||
    err instanceof AppointmentVehicleNotOwnedByCustomerError ||
    err instanceof AppointmentNotFoundError ||
    err instanceof AppointmentNotEditableError ||
    err instanceof AppointmentLinkError ||
    err instanceof AppointmentAlreadyCancelledError
  ) {
    return { success: false, error: err.message };
  }
  return { success: false, error: fallback };
}

export async function createAppointmentAction(input: unknown): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const appointment = await createAppointmentService(userId, input);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/agendamentos");
    return { success: true, appointmentId: appointment.id };
  } catch (err) {
    return mapKnownError(err, "Não foi possível criar o agendamento.");
  }
}

export async function cancelAppointmentAction(appointmentId: string, cancelReason?: string): Promise<ActionResult> {
  try {
    await requireUserId();
    await cancelAppointmentService(appointmentId, { cancelReason });
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/agendamentos");
    return { success: true };
  } catch (err) {
    return mapKnownError(err, "Não foi possível cancelar o agendamento.");
  }
}

export async function updateAppointmentAction(appointmentId: string, input: unknown): Promise<ActionResult> {
  try {
    await requireUserId();
    await updateAppointmentService(appointmentId, input);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/agendamentos");
    return { success: true, appointmentId };
  } catch (err) {
    return mapKnownError(err, "Não foi possível corrigir o agendamento.");
  }
}

export async function setAppointmentAttendanceAction(
  appointmentId: string,
  status: "AGENDADO" | "COMPARECEU" | "NAO_COMPARECEU",
): Promise<ActionResult> {
  try {
    await requireUserId();
    await setAppointmentAttendanceService(appointmentId, { status });
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/agendamentos");
    return { success: true, appointmentId };
  } catch (err) {
    return mapKnownError(err, "Não foi possível marcar o comparecimento.");
  }
}

/** OS que podem ser ligadas a este agendamento (e a sugestão, se for óbvia). */
export async function listLinkableWorkOrdersAction(appointmentId: string) {
  await requireUserId();
  return listLinkableWorkOrdersService(appointmentId);
}

export async function linkAppointmentToWorkOrderAction(appointmentId: string, workOrderId: string): Promise<ActionResult> {
  try {
    await requireUserId();
    await linkAppointmentToExistingWorkOrderService(appointmentId, workOrderId);
    revalidatePath("/dashboard/agendamentos");
    revalidatePath("/dashboard");
    return { success: true, appointmentId };
  } catch (err) {
    return mapKnownError(err, "Não foi possível ligar o agendamento a essa OS.");
  }
}
