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
import { calculateSalePriceCents, reaisToCents } from "@/lib/money";
import { getDefaultMarkupPercent } from "@/lib/settings/service";
import { DuplicatePartSkuError, InsufficientStockError, PartNotActiveError, PartNotFoundError } from "./errors";

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
    markupPercent: input.markupPercent ?? null,
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
    markupPercent: input.markupPercent ?? null,
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

/**
 * Regra crítica, mesmo princípio de `assertServiceIsActive` (Ciclo B):
 * se um item de orçamento/OS/adicional referencia um `partId`, essa peça
 * precisa existir e estar ATIVA no momento da criação do item — SEMPRE
 * validado no servidor, nunca confia que a interface só ofereceu peças
 * ativas no seletor.
 */
export async function assertPartIsActive(partId: string): Promise<PartRecord> {
  const part = await findPartById(partId);
  if (!part) throw new PartNotFoundError(partId);
  if (part.status !== "ATIVO") throw new PartNotActiveError();
  return part;
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

export interface SuggestedSalePrice {
  cents: number;
  markupPercent: number;
  /** Se o markup usado foi o específico da peça ou o padrão da oficina. */
  source: "peça" | "padrão da oficina";
}

/** Preço de venda sugerido = custo × (1 + markup/100). Markup: o da
 * peça, se cadastrado; senão o markup padrão da oficina (Configurações
 * → Precificação). Sem custo cadastrado ou sem nenhum markup
 * disponível -> null (nunca inventa um percentual). Nunca armazenado —
 * sempre recalculado na leitura. */
export async function getPartSuggestedSalePriceService(partId: string): Promise<SuggestedSalePrice | null> {
  const part = await findPartById(partId);
  if (!part || part.costCents === null) return null;

  if (part.markupPercent !== null) {
    return {
      cents: calculateSalePriceCents(part.costCents, part.markupPercent),
      markupPercent: part.markupPercent,
      source: "peça",
    };
  }

  const defaultMarkup = await getDefaultMarkupPercent();
  if (defaultMarkup === null) return null;

  return {
    cents: calculateSalePriceCents(part.costCents, defaultMarkup),
    markupPercent: defaultMarkup,
    source: "padrão da oficina",
  };
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
