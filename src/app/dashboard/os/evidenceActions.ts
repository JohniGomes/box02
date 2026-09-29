"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/auth";
import {
  createWorkOrderEvidenceService,
  deleteWorkOrderEvidenceService,
} from "@/lib/workOrders/service";
import {
  WorkOrderEvidenceLockedError,
  WorkOrderEvidenceNotFoundError,
  WorkOrderNotFoundError,
} from "@/lib/workOrders/errors";

export interface EvidenceActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado.");
  return session.user.id;
}

/** Recebe FormData (não um objeto plano) porque inclui o arquivo em si —
 * mesmo padrão idiomático de upload em Server Actions do Next.js. */
export async function createWorkOrderEvidenceAction(
  workOrderId: string,
  formData: FormData,
): Promise<EvidenceActionResult> {
  try {
    const userId = await requireUserId();

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { success: false, error: "Nenhum arquivo selecionado.", fieldErrors: { file: "Obrigatório" } };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const metadata = {
      type: formData.get("type"),
      description: formData.get("description") || undefined,
      mimeType: file.type,
      fileSize: file.size,
    };

    await createWorkOrderEvidenceService(userId, workOrderId, metadata, buffer);
    revalidatePath(`/dashboard/os/${workOrderId}`);
    return { success: true };
  } catch (err) {
    if (err instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of err.issues) {
        const key = issue.path.join(".") || "_root";
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      return { success: false, error: "Existem campos inválidos.", fieldErrors };
    }
    if (err instanceof WorkOrderNotFoundError) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "Não foi possível salvar a evidência." };
  }
}

export async function deleteWorkOrderEvidenceAction(
  workOrderId: string,
  evidenceId: string,
): Promise<EvidenceActionResult> {
  try {
    const userId = await requireUserId();
    await deleteWorkOrderEvidenceService(userId, workOrderId, evidenceId);
    revalidatePath(`/dashboard/os/${workOrderId}`);
    return { success: true };
  } catch (err) {
    if (
      err instanceof WorkOrderNotFoundError ||
      err instanceof WorkOrderEvidenceNotFoundError ||
      err instanceof WorkOrderEvidenceLockedError
    ) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "Não foi possível excluir a evidência." };
  }
}
