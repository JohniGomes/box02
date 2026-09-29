"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  createCustomerService,
  inactivateCustomerService,
  reactivateCustomerService,
  updateCustomerService,
} from "@/lib/customers/service";
import { DuplicateCustomerDocumentError } from "@/lib/customers/errors";
import { ZodError } from "zod";

export interface ActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  customerId?: string;
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

export async function createCustomerAction(input: unknown): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const customer = await createCustomerService(userId, input);
    revalidatePath("/dashboard/clientes");
    return { success: true, customerId: customer.id };
  } catch (err) {
    if (err instanceof ZodError) {
      return { success: false, error: "Existem campos inválidos.", fieldErrors: toFieldErrors(err) };
    }
    if (err instanceof DuplicateCustomerDocumentError) {
      return { success: false, error: err.message, fieldErrors: { document: err.message } };
    }
    return { success: false, error: "Não foi possível salvar o cliente." };
  }
}

export async function updateCustomerAction(
  customerId: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await updateCustomerService(userId, customerId, input);
    revalidatePath("/dashboard/clientes");
    revalidatePath(`/dashboard/clientes/${customerId}`);
    return { success: true, customerId };
  } catch (err) {
    if (err instanceof ZodError) {
      return { success: false, error: "Existem campos inválidos.", fieldErrors: toFieldErrors(err) };
    }
    if (err instanceof DuplicateCustomerDocumentError) {
      return { success: false, error: err.message, fieldErrors: { document: err.message } };
    }
    return { success: false, error: "Não foi possível salvar as alterações." };
  }
}

export async function inactivateCustomerAction(customerId: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await inactivateCustomerService(userId, customerId);
    revalidatePath("/dashboard/clientes");
    revalidatePath(`/dashboard/clientes/${customerId}`);
    return { success: true, customerId };
  } catch {
    return { success: false, error: "Não foi possível inativar o cliente." };
  }
}

export async function reactivateCustomerAction(customerId: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await reactivateCustomerService(userId, customerId);
    revalidatePath("/dashboard/clientes");
    revalidatePath(`/dashboard/clientes/${customerId}`);
    return { success: true, customerId };
  } catch {
    return { success: false, error: "Não foi possível reativar o cliente." };
  }
}
