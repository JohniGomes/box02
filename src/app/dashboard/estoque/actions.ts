"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/auth";
import {
  createPartService,
  createStockMovementService,
  setPartStatusService,
  updatePartService,
} from "@/lib/inventory/service";
import { DuplicatePartSkuError, InsufficientStockError, PartNotFoundError } from "@/lib/inventory/errors";
import type { PartStatus } from "@/lib/db/repositories/parts";

export interface InventoryActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  partId?: string;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado.");
  return session.user.id;
}

function friendlyError(err: unknown, fallback: string): InventoryActionResult {
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "_root";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { success: false, error: "Existem campos inválidos.", fieldErrors };
  }
  if (err instanceof DuplicatePartSkuError) {
    return { success: false, error: err.message, fieldErrors: { sku: err.message } };
  }
  if (err instanceof PartNotFoundError || err instanceof InsufficientStockError) {
    return { success: false, error: err.message };
  }
  return { success: false, error: fallback };
}

export async function createPartAction(input: unknown): Promise<InventoryActionResult> {
  try {
    await requireUserId();
    const part = await createPartService(input);
    revalidatePath("/dashboard/estoque");
    return { success: true, partId: part.id };
  } catch (err) {
    return friendlyError(err, "Não foi possível cadastrar a peça.");
  }
}

export async function updatePartAction(partId: string, input: unknown): Promise<InventoryActionResult> {
  try {
    await requireUserId();
    await updatePartService(partId, input);
    revalidatePath("/dashboard/estoque");
    revalidatePath(`/dashboard/estoque/${partId}`);
    return { success: true, partId };
  } catch (err) {
    return friendlyError(err, "Não foi possível salvar as alterações.");
  }
}

export async function setPartStatusAction(partId: string, status: PartStatus): Promise<InventoryActionResult> {
  try {
    await requireUserId();
    await setPartStatusService(partId, status);
    revalidatePath("/dashboard/estoque");
    revalidatePath(`/dashboard/estoque/${partId}`);
    return { success: true, partId };
  } catch (err) {
    return friendlyError(err, "Não foi possível alterar o status.");
  }
}

export async function createStockMovementAction(partId: string, input: unknown): Promise<InventoryActionResult> {
  try {
    const userId = await requireUserId();
    await createStockMovementService(userId, partId, input);
    revalidatePath(`/dashboard/estoque/${partId}`);
    revalidatePath("/dashboard/estoque");
    return { success: true, partId };
  } catch (err) {
    return friendlyError(err, "Não foi possível registrar a movimentação.");
  }
}
