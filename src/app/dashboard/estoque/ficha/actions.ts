"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/auth";
import { updateVehicleSheetService } from "@/lib/vehicles/service";
import { VehicleNotFoundError } from "@/lib/vehicles/errors";
import { consultPartsService, type PartConsultResponse } from "@/lib/parts/consult";
import { GeminiBadResponseError, GeminiUnavailableError } from "@/lib/gemini/errors";

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

/** Sugere códigos de peça (com fontes) para o veículo da ficha. Só sugestão: a pessoa confirma no fornecedor. */
export async function consultPartCodesAction(
  input: { marca: string; modelo: string; ano?: string; versao?: string; peca: string },
  refresh?: boolean,
): Promise<{ success: boolean; error?: string; data?: PartConsultResponse }> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Não autenticado." };
  try {
    const data = await consultPartsService(session.user.id, input, { refresh });
    return { success: true, data };
  } catch (err) {
    if (err instanceof ZodError) return { success: false, error: err.issues[0]?.message ?? "Confira os dados do veículo e da peça." };
    if (err instanceof GeminiBadResponseError) {
      return { success: false, error: "A consulta não trouxe uma resposta que eu consiga usar. Tente de novo ou use o Auto Experts." };
    }
    if (err instanceof GeminiUnavailableError) {
      return { success: false, error: "A consulta de códigos está indisponível agora. Use o Auto Experts ou pergunte ao fornecedor." };
    }
    return { success: false, error: "Não foi possível consultar agora. Use o Auto Experts ou pergunte ao fornecedor." };
  }
}
