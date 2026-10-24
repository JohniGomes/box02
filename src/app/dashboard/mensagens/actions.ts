"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { markMessageService, setGoogleReviewLink } from "@/lib/messages/service";

const KINDS = ["CONFIRMACAO", "LEMBRETE", "AVALIACAO", "COBRANCA"] as const;

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
