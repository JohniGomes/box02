"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/auth";
import {
  addChecklistItemService,
  createChecklistService,
  inactivateChecklistService,
  reactivateChecklistService,
  removeChecklistItemService,
  updateChecklistItemService,
  updateChecklistService,
} from "@/lib/checklists/checklistService";
import {
  ActiveChecklistOfTypeAlreadyExistsError,
  ChecklistCodeAlreadyExistsError,
  ChecklistItemNotFoundError,
  ChecklistNotFoundError,
} from "@/lib/checklists/errors";

export interface ChecklistActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  checklistId?: string;
  itemId?: string;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado.");
  return session.user.id;
}

function friendlyError(err: unknown, fallback: string): ChecklistActionResult {
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "_root";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { success: false, error: "Existem campos inválidos.", fieldErrors };
  }
  if (
    err instanceof ChecklistNotFoundError ||
    err instanceof ChecklistCodeAlreadyExistsError ||
    err instanceof ActiveChecklistOfTypeAlreadyExistsError ||
    err instanceof ChecklistItemNotFoundError
  ) {
    return { success: false, error: err.message };
  }
  return { success: false, error: fallback };
}

export async function createChecklistAction(input: unknown): Promise<ChecklistActionResult> {
  try {
    const userId = await requireUserId();
    const checklist = await createChecklistService(userId, input);
    revalidatePath("/dashboard/configuracoes/checklists");
    return { success: true, checklistId: checklist.id };
  } catch (err) {
    return friendlyError(err, "Não foi possível criar o checklist.");
  }
}

export async function updateChecklistAction(
  checklistId: string,
  input: { code: string; name: string },
): Promise<ChecklistActionResult> {
  try {
    const userId = await requireUserId();
    await updateChecklistService(userId, checklistId, input);
    revalidatePath("/dashboard/configuracoes/checklists");
    revalidatePath(`/dashboard/configuracoes/checklists/${checklistId}`);
    return { success: true, checklistId };
  } catch (err) {
    return friendlyError(err, "Não foi possível atualizar o checklist.");
  }
}

export async function inactivateChecklistAction(checklistId: string): Promise<ChecklistActionResult> {
  try {
    const userId = await requireUserId();
    await inactivateChecklistService(userId, checklistId);
    revalidatePath("/dashboard/configuracoes/checklists");
    revalidatePath(`/dashboard/configuracoes/checklists/${checklistId}`);
    return { success: true, checklistId };
  } catch (err) {
    return friendlyError(err, "Não foi possível inativar o checklist.");
  }
}

export async function reactivateChecklistAction(checklistId: string): Promise<ChecklistActionResult> {
  try {
    const userId = await requireUserId();
    await reactivateChecklistService(userId, checklistId);
    revalidatePath("/dashboard/configuracoes/checklists");
    revalidatePath(`/dashboard/configuracoes/checklists/${checklistId}`);
    return { success: true, checklistId };
  } catch (err) {
    return friendlyError(err, "Não foi possível reativar o checklist.");
  }
}

export async function addChecklistItemAction(checklistId: string, input: unknown): Promise<ChecklistActionResult> {
  try {
    const userId = await requireUserId();
    const item = await addChecklistItemService(userId, checklistId, input);
    revalidatePath(`/dashboard/configuracoes/checklists/${checklistId}`);
    return { success: true, checklistId, itemId: item.id };
  } catch (err) {
    return friendlyError(err, "Não foi possível adicionar o item.");
  }
}

export async function updateChecklistItemAction(
  checklistId: string,
  itemId: string,
  input: unknown,
): Promise<ChecklistActionResult> {
  try {
    const userId = await requireUserId();
    await updateChecklistItemService(userId, checklistId, itemId, input);
    revalidatePath(`/dashboard/configuracoes/checklists/${checklistId}`);
    return { success: true, checklistId, itemId };
  } catch (err) {
    return friendlyError(err, "Não foi possível atualizar o item.");
  }
}

export async function removeChecklistItemAction(checklistId: string, itemId: string): Promise<ChecklistActionResult> {
  try {
    const userId = await requireUserId();
    await removeChecklistItemService(userId, checklistId, itemId);
    revalidatePath(`/dashboard/configuracoes/checklists/${checklistId}`);
    return { success: true, checklistId };
  } catch (err) {
    return friendlyError(err, "Não foi possível remover o item.");
  }
}
