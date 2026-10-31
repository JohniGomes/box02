"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  setCardFeePercent,
  setDeliveryChecklistRequired,
  setDetailedStagesEnabled,
  setReceptionRequiredForExecution,
  setShopWhatsapp,
} from "@/lib/settings/service";
import { recordAuditLog } from "@/lib/db/repositories/auditLog";

export interface RulesActionResult {
  success: boolean;
  error?: string;
}

/** Regras que podem ser ligadas/desligadas. As que protegem os números (estoque
 * nunca negativo, pagamento acima do saldo, itens planejados ao entregar) NÃO
 * estão aqui de propósito: ficam sempre ligadas. */
export type RuleKey = "reception" | "deliveryChecklist" | "detailedStages";

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
  detailedStages: {
    set: setDetailedStagesEnabled,
    audit: "RULE_DETAILED_STAGES_UPDATED",
    entityId: "rule_detailed_stages",
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

/** WhatsApp da oficina, usado nos botões da página pública do QR Car. Vazio apaga. */
export async function setShopWhatsappAction(text: string): Promise<RulesActionResult> {
  try {
    const userId = await requireUserId();
    await setShopWhatsapp(text);
    await recordAuditLog({
      userId,
      action: "SHOP_WHATSAPP_UPDATED",
      entityType: "app_setting",
      entityId: "shop_whatsapp",
    });
    revalidatePath("/dashboard/configuracoes/regras");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Não foi possível salvar o WhatsApp." };
  }
}

/** Taxa da maquininha (%), usada só para estimar o lucro. Aceita "6,83" ou "6.83". */
export async function setCardFeeAction(text: string): Promise<RulesActionResult> {
  try {
    const userId = await requireUserId();
    const percent = Number(text.trim().replace(",", "."));
    if (text.trim() === "" || !Number.isFinite(percent)) return { success: false, error: "Digite a taxa, por exemplo 6,83." };
    await setCardFeePercent(percent);
    await recordAuditLog({
      userId,
      action: "CARD_FEE_PERCENT_UPDATED",
      entityType: "app_setting",
      entityId: "card_fee_percent",
      metadata: { percent },
    });
    revalidatePath("/dashboard/configuracoes/regras");
    revalidatePath("/dashboard/financeiro");
    revalidatePath("/dashboard/os", "layout");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Não foi possível salvar a taxa." };
  }
}
