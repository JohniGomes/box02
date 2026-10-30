"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/auth";
import {
  createVehicleService,
  deleteVehicleService,
  inactivateVehicleService,
  reactivateVehicleService,
  transferVehicleService,
  updateVehicleService,
} from "@/lib/vehicles/service";
import {
  DuplicateVehiclePlateError,
  VehicleCustomerNotFoundError,
  VehicleNotDeletableError,
} from "@/lib/vehicles/errors";
import { searchCustomersService } from "@/lib/customers/service";
import { formatDocument } from "@/lib/validation/document";
import { extractVehicleFromCrlv, type CrlvVehicle } from "@/lib/gemini/crlv";
import { friendlyAiMessage } from "@/lib/gemini/errors";

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

export async function deleteVehicleAction(vehicleId: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await deleteVehicleService(userId, vehicleId);
    revalidatePath("/dashboard/veiculos");
    return { success: true, vehicleId };
  } catch (err) {
    if (err instanceof VehicleNotDeletableError) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "Não foi possível excluir o veículo." };
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

/** Lê uma foto do CRLV (só dados do veículo, nada do proprietário) para pré-preencher o cadastro. Não grava nada. */
export async function readCrlvPhotoAction(
  imageBase64: string,
  mimeType: string,
): Promise<{ success: boolean; error?: string; data?: CrlvVehicle }> {
  try {
    await requireUserId();
    if (!/^image\/(jpeg|png|webp)$/.test(mimeType)) return { success: false, error: "Envie uma foto (JPG, PNG ou WebP)." };
    if (!imageBase64 || imageBase64.length > 4_000_000) return { success: false, error: "A foto ficou grande demais. Tire outra, mais de perto." };
    const data = await extractVehicleFromCrlv(imageBase64, mimeType);
    return { success: true, data };
  } catch (err) {
    return { success: false, error: friendlyAiMessage(err) };
  }
}
