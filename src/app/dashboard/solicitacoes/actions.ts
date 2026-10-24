"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  attendServiceRequestService,
  previewServiceRequestMatchesService,
  setServiceRequestStatusService,
  undoServiceRequestAttendanceService,
} from "@/lib/serviceRequests/service";
import {
  ServiceRequestNotAttendedError,
  ServiceRequestNotFoundError,
  ServiceRequestNotPendingError,
} from "@/lib/serviceRequests/errors";
import { QuickRegistrationError } from "@/lib/quickSale/service";
import { ZodError } from "zod";
import {
  AppointmentCustomerNotFoundError,
  AppointmentVehicleNotOwnedByCustomerError,
} from "@/lib/appointments/errors";

export interface ServiceRequestActionResult {
  success: boolean;
  error?: string;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado.");
  return session.user.id;
}

export async function markServiceRequestAttendedAction(
  serviceRequestId: string,
): Promise<ServiceRequestActionResult> {
  try {
    const userId = await requireUserId();
    await setServiceRequestStatusService(userId, serviceRequestId, "ATENDIDA");
    revalidatePath("/dashboard/solicitacoes");
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceRequestNotFoundError) return { success: false, error: err.message };
    return { success: false, error: "Não foi possível marcar como atendida." };
  }
}

export async function discardServiceRequestAction(
  serviceRequestId: string,
): Promise<ServiceRequestActionResult> {
  try {
    const userId = await requireUserId();
    await setServiceRequestStatusService(userId, serviceRequestId, "DESCARTADA");
    revalidatePath("/dashboard/solicitacoes");
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceRequestNotFoundError) return { success: false, error: err.message };
    return { success: false, error: "Não foi possível descartar." };
  }
}

function friendly(err: unknown, fallback: string): ServiceRequestActionResult {
  if (err instanceof ZodError) return { success: false, error: err.issues[0]?.message ?? "Dados inválidos." };
  if (
    err instanceof ServiceRequestNotFoundError ||
    err instanceof ServiceRequestNotPendingError ||
    err instanceof ServiceRequestNotAttendedError ||
    err instanceof QuickRegistrationError ||
    err instanceof AppointmentCustomerNotFoundError ||
    err instanceof AppointmentVehicleNotOwnedByCustomerError
  ) {
    return { success: false, error: err.message };
  }
  return { success: false, error: fallback };
}

/** O que já existe no cadastro para esta solicitação (cliente por telefone, veículo por placa). */
export interface ServiceRequestMatchesView {
  plate: string | null;
  model: string | null;
  customers: { id: string; name: string; phone: string | null }[];
  vehiclesByCustomer: Record<string, { id: string; label: string; plate: string | null }[]>;
  plateOwner: { vehicleId: string; customerId: string; customerName: string } | null;
  request: {
    id: string;
    customerName: string;
    customerPhone: string;
    vehicleDescription: string | null;
    vehiclePlate: string | null;
    preferredTime: string | null;
    description: string;
  };
}

export async function previewServiceRequestMatchesAction(
  serviceRequestId: string,
): Promise<{ success: boolean; error?: string; matches?: ServiceRequestMatchesView }> {
  try {
    await requireUserId();
    const m = await previewServiceRequestMatchesService(serviceRequestId);
    const r = m.request;
    return {
      success: true,
      matches: {
        ...m,
        request: {
          id: r.id,
          customerName: r.customerName,
          customerPhone: r.customerPhone,
          vehicleDescription: r.vehicleDescription,
          vehiclePlate: r.vehiclePlate,
          preferredTime: r.preferredTime,
          description: r.description,
        },
      },
    };
  } catch (err) {
    return friendly(err, "Não foi possível consultar os cadastros.");
  }
}

export async function attendServiceRequestAction(
  serviceRequestId: string,
  input: { customerId?: string; vehicle: string; scheduledAt: string; description?: string },
): Promise<ServiceRequestActionResult> {
  try {
    const userId = await requireUserId();
    if (!input.scheduledAt) return { success: false, error: "Informe a data e a hora do agendamento." };
    await attendServiceRequestService(userId, serviceRequestId, input);
    revalidatePath("/dashboard/solicitacoes");
    revalidatePath("/dashboard/agendamentos");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    return friendly(err, "Não foi possível atender a solicitação.");
  }
}

export async function undoServiceRequestAttendanceAction(serviceRequestId: string): Promise<ServiceRequestActionResult> {
  try {
    const userId = await requireUserId();
    await undoServiceRequestAttendanceService(userId, serviceRequestId);
    revalidatePath("/dashboard/solicitacoes");
    revalidatePath("/dashboard/agendamentos");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    return friendly(err, "Não foi possível desfazer.");
  }
}
