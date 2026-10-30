"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { markMessageService, setGoogleReviewLink } from "@/lib/messages/service";
import { setRemindersConsentService } from "@/lib/customers/service";

const KINDS = ["CONFIRMACAO", "LEMBRETE", "AVALIACAO", "COBRANCA", "TROCA", "PERMISSAO"] as const;

/** O cliente respondeu ao pedido de permissão: grava no cadastro e tira o pedido da fila. */
export async function answerConsentAction(
  customerId: string,
  answer: "SIM" | "NAO",
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Não autenticado." };
  if ((answer !== "SIM" && answer !== "NAO") || !customerId) return { success: false, error: "Resposta inválida." };
  try {
    await setRemindersConsentService(session.user.id, customerId, answer);
    revalidatePath("/dashboard/mensagens");
    revalidatePath(`/dashboard/clientes/${customerId}`);
    revalidatePath("/dashboard");
    return { success: true };
  } catch {
    return { success: false, error: "Não foi possível registrar a resposta." };
  }
}

export async function markMessageAction(
  kind: string,
  refId: string,
  action: "ENVIADA" | "PULADA",
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Não autenticado." };
  if (!(KINDS as readonly string[]).includes(kind) || !refId) return { success: false, error: "Mensagem inválida." };
  try {
    await markMessageService(session.user.id, { kind: kind as (typeof KINDS)[number], refId, action });
    revalidatePath("/dashboard/mensagens");
    revalidatePath("/dashboard");
    return { success: true };
  } catch {
    return { success: false, error: "Não foi possível registrar." };
  }
}

export async function saveReviewLinkAction(link: string): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Não autenticado." };
  try {
    await setGoogleReviewLink(link);
    revalidatePath("/dashboard/mensagens");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Não foi possível salvar." };
  }
}
