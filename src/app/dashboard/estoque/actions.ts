"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/auth";
import {
  createPartService,
  createPurchasedPartService,
  createStockMovementService,
  getPartSuggestedSalePriceService,
  listPartsWithStockService,
  setPartStatusService,
  updatePartService,
} from "@/lib/inventory/service";
import {
  DuplicatePartNameError,
  DuplicatePartSkuError,
  InsufficientStockError,
  InvalidPurchasedPartError,
  PartNotFoundError,
} from "@/lib/inventory/errors";
import { centsToReais } from "@/lib/money";
import type { PartStatus, PartWithStock } from "@/lib/db/repositories/parts";

export interface InventoryActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  partId?: string;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado.");
  return session.user.id;
}

function friendlyError(err: unknown, fallback: string): InventoryActionResult {
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "_root";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { success: false, error: "Existem campos inválidos.", fieldErrors };
  }
  if (err instanceof DuplicatePartSkuError) {
    return { success: false, error: err.message, fieldErrors: { sku: err.message } };
  }
  if (err instanceof PartNotFoundError || err instanceof InsufficientStockError) {
    return { success: false, error: err.message };
  }
  return { success: false, error: fallback };
}

export async function createPartAction(input: unknown): Promise<InventoryActionResult> {
  try {
    await requireUserId();
    const part = await createPartService(input);
    revalidatePath("/dashboard/estoque");
    return { success: true, partId: part.id };
  } catch (err) {
    return friendlyError(err, "Não foi possível cadastrar a peça.");
  }
}

export async function updatePartAction(partId: string, input: unknown): Promise<InventoryActionResult> {
  try {
    await requireUserId();
    await updatePartService(partId, input);
    revalidatePath("/dashboard/estoque");
    revalidatePath(`/dashboard/estoque/${partId}`);
    return { success: true, partId };
  } catch (err) {
    return friendlyError(err, "Não foi possível salvar as alterações.");
  }
}

export async function setPartStatusAction(partId: string, status: PartStatus): Promise<InventoryActionResult> {
  try {
    await requireUserId();
    await setPartStatusService(partId, status);
    revalidatePath("/dashboard/estoque");
    revalidatePath(`/dashboard/estoque/${partId}`);
    return { success: true, partId };
  } catch (err) {
    return friendlyError(err, "Não foi possível alterar o status.");
  }
}

/** Ciclo H — seletor de peça reutilizável (orçamento/OS/adicional), mesmo
 * padrão de `ServicePickerOption`: só peças ATIVAS, com o preço de venda
 * sugerido (custo + markup) já calculado para pré-preencher o form —
 * nunca grava nada sozinho, a validação real acontece no servidor. */
export interface PartPickerOption {
  id: string;
  label: string;
  unit: string;
  currentStock: number;
  suggestedPriceReais: string | null;
  suggestedPriceSource: "peça" | "padrão da oficina" | null;
}

async function toPickerOption(p: PartWithStock): Promise<PartPickerOption> {
  const suggested = await getPartSuggestedSalePriceService(p.id);
  return {
    id: p.id,
    label: p.sku ? `${p.name} (${p.sku})` : p.name,
    unit: p.unit,
    currentStock: p.currentStock,
    suggestedPriceReais: suggested ? centsToReais(suggested.cents) : null,
    suggestedPriceSource: suggested ? suggested.source : null,
  };
}

export async function searchActivePartsForPickerAction(query: string): Promise<PartPickerOption[]> {
  await requireUserId();
  const parts = await listPartsWithStockService(query);
  return Promise.all(parts.filter((p) => p.status === "ATIVO").map(toPickerOption));
}

export interface PurchasedPartResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  part?: PartPickerOption;
  quantity?: number;
}

/** Peça comprada para um cliente: cria a peça + entrada de estoque e devolve a
 * peça já no formato do seletor, para o orçamento/OS preencher o item. */
export async function createPurchasedPartAction(input: unknown): Promise<PurchasedPartResult> {
  try {
    const userId = await requireUserId();
    const { part, quantity } = await createPurchasedPartService(userId, input);
    revalidatePath("/dashboard/estoque");
    const option = await toPickerOption({ ...part, currentStock: quantity });
    return { success: true, part: option, quantity };
  } catch (err) {
    if (err instanceof DuplicatePartNameError || err instanceof InvalidPurchasedPartError) {
      return { success: false, error: err.message };
    }
    const base = friendlyError(err, "Não foi possível cadastrar a peça.");
    return { success: false, error: base.error, fieldErrors: base.fieldErrors };
  }
}

export async function createStockMovementAction(partId: string, input: unknown): Promise<InventoryActionResult> {
  try {
    const userId = await requireUserId();
    await createStockMovementService(userId, partId, input);
    revalidatePath(`/dashboard/estoque/${partId}`);
    revalidatePath("/dashboard/estoque");
    return { success: true, partId };
  } catch (err) {
    return friendlyError(err, "Não foi possível registrar a movimentação.");
  }
}
