"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { DraftError, deleteDraftService, getDraftService, saveDraftService } from "@/lib/drafts/service";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado.");
  return session.user.id;
}

export interface SaveDraftResult {
  success: boolean;
  error?: string;
  id?: string;
  savedAt?: string;
}

export async function saveDraftAction(input: {
  id?: string;
  kind: string;
  title: string;
  payload: unknown;
}): Promise<SaveDraftResult> {
  try {
    const userId = await requireUserId();
    const draft = await saveDraftService(userId, input);
    revalidatePath("/dashboard");
    return { success: true, id: draft.id, savedAt: draft.updatedAt.toISOString() };
  } catch (err) {
    if (err instanceof DraftError) return { success: false, error: err.message };
    console.error("saveDraftAction falhou:", err);
    return { success: false, error: "Não foi possível salvar o rascunho." };
  }
}

export async function getDraftAction(id: string): Promise<{ id: string; kind: string; payload: unknown } | null> {
  await requireUserId();
  const draft = await getDraftService(id);
  return draft ? { id: draft.id, kind: draft.kind, payload: draft.payload } : null;
}

export async function deleteDraftAction(id: string): Promise<void> {
  await requireUserId();
  await deleteDraftService(id);
  revalidatePath("/dashboard");
}
