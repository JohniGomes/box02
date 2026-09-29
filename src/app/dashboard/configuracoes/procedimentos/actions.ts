"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/auth";
import {
  createProcedureService,
  inactivateProcedureService,
  reactivateProcedureService,
  updateProcedureService,
} from "@/lib/checklists/procedureService";
import { ProcedureCodeAlreadyExistsError, ProcedureNotFoundError } from "@/lib/checklists/errors";

export interface ProcedureActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  procedureId?: string;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado.");
  return session.user.id;
}

function friendlyError(err: unknown, fallback: string): ProcedureActionResult {
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "_root";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { success: false, error: "Existem campos inválidos.", fieldErrors };
  }
  if (err instanceof ProcedureNotFoundError || err instanceof ProcedureCodeAlreadyExistsError) {
    return { success: false, error: err.message };
  }
  return { success: false, error: fallback };
}

export async function createProcedureAction(input: unknown): Promise<ProcedureActionResult> {
  try {
    const userId = await requireUserId();
    const procedure = await createProcedureService(userId, input);
    revalidatePath("/dashboard/configuracoes/procedimentos");
    return { success: true, procedureId: procedure.id };
  } catch (err) {
    return friendlyError(err, "Não foi possível criar o procedimento.");
  }
}

export async function updateProcedureAction(procedureId: string, input: unknown): Promise<ProcedureActionResult> {
  try {
    const userId = await requireUserId();
    await updateProcedureService(userId, procedureId, input);
    revalidatePath("/dashboard/configuracoes/procedimentos");
    revalidatePath(`/dashboard/configuracoes/procedimentos/${procedureId}`);
    return { success: true, procedureId };
  } catch (err) {
    return friendlyError(err, "Não foi possível atualizar o procedimento.");
  }
}

export async function inactivateProcedureAction(procedureId: string): Promise<ProcedureActionResult> {
  try {
    const userId = await requireUserId();
    await inactivateProcedureService(userId, procedureId);
    revalidatePath("/dashboard/configuracoes/procedimentos");
    revalidatePath(`/dashboard/configuracoes/procedimentos/${procedureId}`);
    return { success: true, procedureId };
  } catch (err) {
    return friendlyError(err, "Não foi possível inativar o procedimento.");
  }
}

export async function reactivateProcedureAction(procedureId: string): Promise<ProcedureActionResult> {
  try {
    const userId = await requireUserId();
    await reactivateProcedureService(userId, procedureId);
    revalidatePath("/dashboard/configuracoes/procedimentos");
    revalidatePath(`/dashboard/configuracoes/procedimentos/${procedureId}`);
    return { success: true, procedureId };
  } catch (err) {
    return friendlyError(err, "Não foi possível reativar o procedimento.");
  }
}
