"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/auth";
import {
  createVehicleService,
  inactivateVehicleService,
  reactivateVehicleService,
  transferVehicleService,
  updateVehicleService,
} from "@/lib/vehicles/service";
import {
  DuplicateVehiclePlateError,
  VehicleCustomerNotFoundError,
} from "@/lib/vehicles/errors";
import { searchCustomersService } from "@/lib/customers/service";
import { formatDocument } from "@/lib/validation/document";

export interface ActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  vehicleId?: string;
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

export async function createVehicleAction(input: unknown): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const vehicle = await createVehicleService(userId, input);
    revalidatePath("/dashboard/veiculos");
    revalidatePath(`/dashboard/clientes/${vehicle.customerId}`);
    return { success: true, vehicleId: vehicle.id };
  } catch (err) {
    if (err instanceof ZodError) {
      return { success: false, error: "Existem campos inválidos.", fieldErrors: toFieldErrors(err) };
    }
    if (err instanceof DuplicateVehiclePlateError) {
      return { success: false, error: err.message, fieldErrors: { plate: err.message } };
    }
    if (err instanceof VehicleCustomerNotFoundError) {
      return { success: false, error: err.message, fieldErrors: { customerId: err.message } };
    }
    return { success: false, error: "Não foi possível salvar o veículo." };
  }
}

export async function updateVehicleAction(
  vehicleId: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const vehicle = await updateVehicleService(userId, vehicleId, input);
    revalidatePath("/dashboard/veiculos");
    revalidatePath(`/dashboard/veiculos/${vehicleId}`);
    revalidatePath(`/dashboard/clientes/${vehicle.customerId}`);
    return { success: true, vehicleId };
  } catch (err) {
    if (err instanceof ZodError) {
      return { success: false, error: "Existem campos inválidos.", fieldErrors: toFieldErrors(err) };
    }
    if (err instanceof DuplicateVehiclePlateError) {
      return { success: false, error: err.message, fieldErrors: { plate: err.message } };
    }
    return { success: false, error: "Não foi possível salvar as alterações." };
  }
}

export async function inactivateVehicleAction(vehicleId: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const vehicle = await inactivateVehicleService(userId, vehicleId);
    revalidatePath("/dashboard/veiculos");
    revalidatePath(`/dashboard/veiculos/${vehicleId}`);
    revalidatePath(`/dashboard/clientes/${vehicle.customerId}`);
    return { success: true, vehicleId };
  } catch {
    return { success: false, error: "Não foi possível inativar o veículo." };
  }
}

export async function reactivateVehicleAction(vehicleId: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const vehicle = await reactivateVehicleService(userId, vehicleId);
    revalidatePath("/dashboard/veiculos");
    revalidatePath(`/dashboard/veiculos/${vehicleId}`);
    revalidatePath(`/dashboard/clientes/${vehicle.customerId}`);
    return { success: true, vehicleId };
  } catch {
    return { success: false, error: "Não foi possível reativar o veículo." };
  }
}

export async function transferVehicleAction(
  vehicleId: string,
  newCustomerId: string,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const vehicle = await transferVehicleService(userId, vehicleId, newCustomerId);
    revalidatePath("/dashboard/veiculos");
    revalidatePath(`/dashboard/veiculos/${vehicleId}`);
    revalidatePath(`/dashboard/clientes/${vehicle.customerId}`);
    return { success: true, vehicleId };
  } catch (err) {
    if (err instanceof VehicleCustomerNotFoundError) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "Não foi possível transferir o veículo." };
  }
}

export interface CustomerPickerResult {
  id: string;
  label: string;
}

/** Usado pelo seletor de cliente no formulário de veículo (busca leve). */
export async function searchCustomersForPickerAction(
  query: string,
): Promise<CustomerPickerResult[]> {
  await requireUserId();
  const { items } = await searchCustomersService({ query, status: undefined, limit: 8 });
  return items.map((c) => ({
    id: c.id,
    label: c.document ? `${c.legalName} · ${formatDocument(c.document)}` : c.legalName,
  }));
}
