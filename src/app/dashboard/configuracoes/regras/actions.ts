"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { setDeliveryChecklistRequired, setReceptionRequiredForExecution } from "@/lib/settings/service";
import { recordAuditLog } from "@/lib/db/repositories/auditLog";

export interface RulesActionResult {
  success: boolean;
  error?: string;
}

/** Regras que podem ser ligadas/desligadas. As que protegem os números (estoque
 * nunca negativo, pagamento acima do saldo, itens planejados ao entregar) NÃO
 * estão aqui de propósito: ficam sempre ligadas. */
export type RuleKey = "reception" | "deliveryChecklist";

const RULES: Record<RuleKey, { set: (v: boolean) => Promise<void>; audit: string; entityId: string }> = {
  reception: {
    set: setReceptionRequiredForExecution,
    audit: "RULE_RECEPTION_REQUIRED_UPDATED",
    entityId: "rule_reception_required_for_execution",
  },
  deliveryChecklist: {
    set: setDeliveryChecklistRequired,
    audit: "RULE_DELIVERY_CHECKLIST_REQUIRED_UPDATED",
    entityId: "rule_delivery_checklist_required",
  },
};

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado.");
  return session.user.id;
}

export async function setRuleAction(rule: RuleKey, required: boolean): Promise<RulesActionResult> {
  try {
    const userId = await requireUserId();
    const def = RULES[rule];
    if (!def) return { success: false, error: "Regra desconhecida." };
    await def.set(required);

    await recordAuditLog({
      userId,
      action: def.audit,
      entityType: "app_setting",
      entityId: def.entityId,
      metadata: { required },
    });

    revalidatePath("/dashboard/configuracoes/regras");
    revalidatePath("/dashboard/os", "layout");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Não foi possível salvar a regra." };
  }
}
