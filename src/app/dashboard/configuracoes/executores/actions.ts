"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/auth";
import {
  createExecutorService,
  ExecutorNameTakenError,
  ExecutorNotFoundError,
  setExecutorStatusService,
} from "@/lib/executors/service";

export interface ExecutorActionResult {
  success: boolean;
  error?: string;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado.");
  return session.user.id;
}

function friendlyError(err: unknown, fallback: string): ExecutorActionResult {
  if (err instanceof ZodError) {
    return { success: false, error: err.issues[0]?.message ?? "Dados inválidos." };
  }
  if (err instanceof ExecutorNameTakenError || err instanceof ExecutorNotFoundError) {
    return { success: false, error: err.message };
  }
  return { success: false, error: fallback };
}

export async function createExecutorAction(name: string): Promise<ExecutorActionResult> {
  try {
    const userId = await requireUserId();
    await createExecutorService(userId, name);
    revalidatePath("/dashboard/configuracoes/executores");
    return { success: true };
  } catch (err) {
    return friendlyError(err, "Não foi possível adicionar o executor.");
  }
}

export async function setExecutorStatusAction(
  executorId: string,
  status: "ATIVO" | "INATIVO",
): Promise<ExecutorActionResult> {
  try {
    const userId = await requireUserId();
    await setExecutorStatusService(userId, executorId, status);
    revalidatePath("/dashboard/configuracoes/executores");
    return { success: true };
  } catch (err) {
    return friendlyError(err, "Não foi possível alterar o executor.");
  }
}
