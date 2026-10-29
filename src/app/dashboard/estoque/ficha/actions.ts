"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/auth";
import { updateVehicleSheetService } from "@/lib/vehicles/service";
import { VehicleNotFoundError } from "@/lib/vehicles/errors";

/** Guarda no cadastro do veículo o que foi preenchido na ficha, para a próxima compra já vir pronto. */
export async function saveVehicleSheetAction(
  vehicleId: string,
  sheet: { brand?: string; model?: string; version?: string; yearManufacture?: string; yearModel?: string; chassis?: string },
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Não autenticado." };
  try {
    await updateVehicleSheetService(session.user.id, vehicleId, sheet);
    revalidatePath("/dashboard/estoque/ficha");
    revalidatePath(`/dashboard/veiculos/${vehicleId}`);
    return { success: true };
  } catch (err) {
    if (err instanceof ZodError) return { success: false, error: "Confira os anos (entre 1950 e o ano que vem)." };
    if (err instanceof VehicleNotFoundError) return { success: false, error: "Veículo não encontrado." };
    return { success: false, error: "Não foi possível salvar no cadastro." };
  }
}
