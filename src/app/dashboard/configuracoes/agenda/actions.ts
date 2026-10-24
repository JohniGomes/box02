"use server";

import { auth } from "@/auth";
import { regenerateCalendarFeedToken } from "@/lib/appointments/feed";

export async function regenerateCalendarFeedTokenAction(): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Não autenticado." };
  try {
    await regenerateCalendarFeedToken();
    return { success: true };
  } catch {
    return { success: false, error: "Não foi possível gerar o endereço." };
  }
}
