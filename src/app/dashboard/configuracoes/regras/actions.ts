"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { setReceptionRequiredForExecution } from "@/lib/settings/service";
import { recordAuditLog } from "@/lib/db/repositories/auditLog";

export interface RulesActionResult {
  success: boolean;
  error?: string;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado.");
  return session.user.id;
}

export async function setReceptionRequiredAction(required: boolean): Promise<RulesActionResult> {
  try {
    const userId = await requireUserId();
    await setReceptionRequiredForExecution(required);

    await recordAuditLog({
      userId,
      action: "RULE_RECEPTION_REQUIRED_UPDATED",
      entityType: "app_setting",
      entityId: "rule_reception_required_for_execution",
      metadata: { required },
    });

    revalidatePath("/dashboard/configuracoes/regras");
    revalidatePath("/dashboard/os");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Não foi possível salvar a regra." };
  }
}
