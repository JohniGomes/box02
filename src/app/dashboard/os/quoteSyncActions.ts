"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { applyQuoteSyncService, type QuoteSyncResult } from "@/lib/workOrders/quoteSyncService";
import type { SyncApplyChoice } from "@/lib/workOrders/quoteSync";
import { WorkOrderCorrectionError } from "@/lib/workOrders/service";
import { WorkOrderNotFoundError } from "@/lib/workOrders/errors";

export interface QuoteSyncActionResult {
  success: boolean;
  error?: string;
  result?: QuoteSyncResult;
}

/** Aplica na OS o que foi escolhido na comparação com a versão nova do orçamento. */
export async function applyQuoteSyncAction(workOrderId: string, choice: SyncApplyChoice): Promise<QuoteSyncActionResult> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Não autenticado." };
    const result = await applyQuoteSyncService(session.user.id, workOrderId, {
      updates: Array.isArray(choice.updates) ? choice.updates : [],
      removals: Array.isArray(choice.removals) ? choice.removals : [],
      additions: Array.isArray(choice.additions) ? choice.additions : [],
      syncAdjustments: Boolean(choice.syncAdjustments),
    });
    revalidatePath(`/dashboard/os/${workOrderId}`);
    revalidatePath(`/dashboard/os/${workOrderId}/detalhes`);
    revalidatePath(`/dashboard/os/${workOrderId}/sincronizar`);
    return { success: true, result };
  } catch (err) {
    if (err instanceof WorkOrderCorrectionError || err instanceof WorkOrderNotFoundError) return { success: false, error: err.message };
    return { success: false, error: "Não foi possível sincronizar a OS com o orçamento." };
  }
}
