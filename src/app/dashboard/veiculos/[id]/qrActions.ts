"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { generateVehicleQrService, revokeVehicleQrService } from "@/lib/vehicles/qr";

export interface QrActionResult {
  success: boolean;
  error?: string;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado.");
  return session.user.id;
}

/** Gera o QR do veículo, ou troca o código (o link antigo deixa de funcionar). */
export async function generateVehicleQrAction(vehicleId: string): Promise<QrActionResult> {
  try {
    const userId = await requireUserId();
    await generateVehicleQrService(userId, vehicleId);
    revalidatePath(`/dashboard/veiculos/${vehicleId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Não foi possível gerar o QR agora." };
  }
}

export async function revokeVehicleQrAction(vehicleId: string): Promise<QrActionResult> {
  try {
    const userId = await requireUserId();
    await revokeVehicleQrService(userId, vehicleId);
    revalidatePath(`/dashboard/veiculos/${vehicleId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Não foi possível desativar o QR agora." };
  }
}
