"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/auth";
import {
  createQuickCustomerService,
  createQuickVehicleService,
  lookupCustomerByPhoneService,
  quickSaleService,
  QuickRegistrationError,
  vehicleLabel,
  type CustomerLookup,
} from "@/lib/quickSale/service";
import { RetroactiveServiceError, RetroactiveServiceIncompleteError } from "@/lib/workOrders/retroactive";
import { InvalidExecutorUserError } from "@/lib/workOrders/errors";
import { VehicleNotOwnedByCustomerError } from "@/lib/quotes/errors";
import { DuplicateCustomerDocumentError } from "@/lib/customers/errors";
import { DuplicateVehiclePlateError } from "@/lib/vehicles/errors";
import { PartNotActiveError, PartNotFoundError } from "@/lib/inventory/errors";

export interface QuickActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado.");
  return session.user.id;
}

function friendlyError(err: unknown, fallback: string): QuickActionResult {
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "_root";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    // Mostra o primeiro motivo em vez de só "campos inválidos".
    return { success: false, error: err.issues[0]?.message ?? "Existem campos inválidos.", fieldErrors };
  }
  if (
    err instanceof QuickRegistrationError ||
    err instanceof RetroactiveServiceError ||
    err instanceof RetroactiveServiceIncompleteError ||
    err instanceof InvalidExecutorUserError ||
    err instanceof VehicleNotOwnedByCustomerError ||
    err instanceof DuplicateCustomerDocumentError ||
    err instanceof DuplicateVehiclePlateError ||
    err instanceof PartNotActiveError ||
    err instanceof PartNotFoundError
  ) {
    return { success: false, error: err.message };
  }
  return { success: false, error: fallback };
}

export async function lookupCustomerByPhoneAction(phone: string): Promise<CustomerLookup | null> {
  await requireUserId();
  return lookupCustomerByPhoneService(phone);
}

export interface QuickCustomerActionResult extends QuickActionResult {
  customer?: { id: string; label: string };
  reused?: boolean;
}

export async function createQuickCustomerAction(input: {
  name: string;
  phone?: string;
}): Promise<QuickCustomerActionResult> {
  try {
    const userId = await requireUserId();
    const { customer, reused } = await createQuickCustomerService(userId, input);
    revalidatePath("/dashboard/clientes");
    return { success: true, customer: { id: customer.id, label: customer.legalName }, reused };
  } catch (err) {
    return friendlyError(err, "Não foi possível cadastrar o cliente.");
  }
}

export interface QuickVehicleActionResult extends QuickActionResult {
  vehicle?: { id: string; label: string };
  reused?: boolean;
}

export async function createQuickVehicleAction(input: {
  customerId: string;
  model?: string;
  plate?: string;
}): Promise<QuickVehicleActionResult> {
  try {
    const userId = await requireUserId();
    const { vehicle, reused } = await createQuickVehicleService(userId, input);
    revalidatePath("/dashboard/veiculos");
    return { success: true, vehicle: { id: vehicle.id, label: vehicleLabel(vehicle) }, reused };
  } catch (err) {
    return friendlyError(err, "Não foi possível cadastrar o veículo.");
  }
}

export interface QuickSaleActionResult extends QuickActionResult {
  workOrderId?: string;
}

export async function quickSaleAction(input: unknown): Promise<QuickSaleActionResult> {
  try {
    const userId = await requireUserId();
    const result = await quickSaleService(userId, input);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/os");
    revalidatePath("/dashboard/orcamentos");
    revalidatePath("/dashboard/clientes");
    return { success: true, workOrderId: result.workOrderId };
  } catch (err) {
    return friendlyError(err, "Não foi possível registrar a venda.");
  }
}
