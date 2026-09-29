"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getDefaultMarkupPercent, setDefaultMarkupPercent } from "@/lib/settings/service";
import { recordAuditLog } from "@/lib/db/repositories/auditLog";

export interface PricingActionResult {
  success: boolean;
  error?: string;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado.");
  return session.user.id;
}

export async function getDefaultMarkupPercentAction(): Promise<number | null> {
  await requireUserId();
  return getDefaultMarkupPercent();
}

export async function setDefaultMarkupPercentAction(percent: number): Promise<PricingActionResult> {
  try {
    const userId = await requireUserId();
    await setDefaultMarkupPercent(percent);

    await recordAuditLog({
      userId,
      action: "PRICING_DEFAULT_MARKUP_UPDATED",
      entityType: "app_setting",
      entityId: "pricing_default_markup_percent",
      metadata: { percent },
    });

    revalidatePath("/dashboard/configuracoes/precificacao");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Não foi possível salvar o markup padrão." };
  }
}
