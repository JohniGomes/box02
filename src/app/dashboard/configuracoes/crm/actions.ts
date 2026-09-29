"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { setReengagementThresholdService } from "@/lib/crm/service";
import { recordAuditLog } from "@/lib/db/repositories/auditLog";

export interface CrmConfigActionResult {
  success: boolean;
  error?: string;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado.");
  return session.user.id;
}

export async function setReengagementThresholdAction(days: number): Promise<CrmConfigActionResult> {
  try {
    const userId = await requireUserId();
    await setReengagementThresholdService(days);

    await recordAuditLog({
      userId,
      action: "CRM_REENGAGEMENT_THRESHOLD_UPDATED",
      entityType: "app_setting",
      entityId: "crm_reengagement_threshold_days",
      metadata: { days },
    });

    revalidatePath("/dashboard/configuracoes/crm");
    revalidatePath("/dashboard/crm");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Não foi possível salvar o limite." };
  }
}
