import {
  createPart,
  findPartById,
  findPartBySku,
  getPartCurrentStock,
  listPartsWithStock,
  setPartStatus,
  updatePart,
  type PartRecord,
  type PartStatus,
  type PartWithStock,
} from "@/lib/db/repositories/parts";
import {
  createStockMovement,
  listStockMovementsByPart,
  type StockMovementRecord,
} from "@/lib/db/repositories/stockMovements";
import { createPartSchema, createStockMovementSchema, updatePartSchema } from "@/lib/validation/part";
import { reaisToCents } from "@/lib/money";
import { DuplicatePartSkuError, InsufficientStockError, PartNotFoundError } from "./errors";

export async function createPartService(rawInput: unknown): Promise<PartRecord> {
  const input = createPartSchema.parse(rawInput);

  if (input.sku) {
    const existing = await findPartBySku(input.sku);
    if (existing) throw new DuplicatePartSkuError(input.sku);
  }

  return createPart({
    name: input.name,
    sku: input.sku ?? null,
    unit: input.unit,
    costCents: input.costReais !== undefined && input.costReais !== "" ? reaisToCents(input.costReais) : null,
    minStock: input.minStock ?? null,
    notes: input.notes ?? null,
  });
}

export async function updatePartService(partId: string, rawInput: unknown): Promise<PartRecord> {
  const input = updatePartSchema.parse(rawInput);
  const existing = await findPartById(partId);
  if (!existing) throw new PartNotFoundError(partId);

  if (input.sku && input.sku !== existing.sku) {
    const dup = await findPartBySku(input.sku);
    if (dup) throw new DuplicatePartSkuError(input.sku);
  }

  const updated = await updatePart(partId, {
    name: input.name,
    sku: input.sku ?? null,
    unit: input.unit,
    costCents: input.costReais !== undefined && input.costReais !== "" ? reaisToCents(input.costReais) : null,
    minStock: input.minStock ?? null,
    notes: input.notes ?? null,
  });
  if (!updated) throw new PartNotFoundError(partId);
  return updated;
}

export async function setPartStatusService(partId: string, status: PartStatus): Promise<PartRecord> {
  const updated = await setPartStatus(partId, status);
  if (!updated) throw new PartNotFoundError(partId);
  return updated;
}

export async function getPartService(partId: string): Promise<PartRecord | null> {
  return findPartById(partId);
}

export async function listPartsWithStockService(query?: string): Promise<PartWithStock[]> {
  return listPartsWithStock(query);
}

export async function listStockMovementsByPartService(partId: string): Promise<StockMovementRecord[]> {
  return listStockMovementsByPart(partId);
}

export async function getPartCurrentStockService(partId: string): Promise<number> {
  return getPartCurrentStock(partId);
}

/** SAIDA nunca deixa o saldo negativo — valida contra o estoque atual
 * antes de gravar. ENTRADA não tem restrição. */
export async function createStockMovementService(
  actorUserId: string,
  partId: string,
  rawInput: unknown,
): Promise<StockMovementRecord> {
  const input = createStockMovementSchema.parse(rawInput);

  const part = await findPartById(partId);
  if (!part) throw new PartNotFoundError(partId);

  if (input.type === "SAIDA") {
    const currentStock = await getPartCurrentStock(partId);
    if (input.quantity > currentStock) {
      throw new InsufficientStockError(currentStock, input.quantity);
    }
  }

  return createStockMovement({
    partId,
    type: input.type,
    quantity: input.quantity,
    reason: input.reason ?? null,
    createdByUserId: actorUserId,
  });
}
