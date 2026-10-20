import { z } from "zod";
import { findWorkOrderById } from "@/lib/db/repositories/workOrders";
import { findWorkOrderItemById } from "@/lib/db/repositories/workOrderItems";
import { findPartById, getPartCurrentStock, updatePart } from "@/lib/db/repositories/parts";
import { createStockMovement } from "@/lib/db/repositories/stockMovements";
import { recordAuditLog } from "@/lib/db/repositories/auditLog";
import { centsToReais, reaisToCents } from "@/lib/money";
import { setWorkOrderItemStatusService } from "./service";
import {
  InvalidWorkOrderItemTransitionError,
  WorkOrderItemNotFoundError,
  WorkOrderNotFoundError,
} from "./errors";

/** A mesma conta da baixa automática: quantidade do item, arredondada, no mínimo 1. */
function neededUnits(quantity: string | number): number {
  return Math.max(1, Math.round(Number(quantity)));
}

export interface StockEntryDefaults {
  partName: string;
  unit: string;
  available: number;
  needed: number;
  /** Quanto falta para a baixa fechar. */
  shortage: number;
  /** Custo atual da peça (R$), para vir preenchido. */
  costReais: string | null;
}

async function loadItemAndPart(workOrderId: string, itemId: string) {
  const workOrder = await findWorkOrderById(workOrderId);
  if (!workOrder) throw new WorkOrderNotFoundError(workOrderId);
  const item = await findWorkOrderItemById(itemId);
  if (!item || item.workOrderId !== workOrderId) throw new WorkOrderItemNotFoundError(itemId);
  if (item.status !== "PLANEJADO") {
    throw new InvalidWorkOrderItemTransitionError(`Este item já está "${item.status}".`);
  }
  if (!item.partId) {
    throw new InvalidWorkOrderItemTransitionError("Este item não está ligado a uma peça do estoque.");
  }
  const part = await findPartById(item.partId);
  if (!part) throw new InvalidWorkOrderItemTransitionError("A peça deste item não foi encontrada.");
  return { workOrder, item, part };
}

/** Dados para o aviso "faltam X unidades — dar entrada e executar". */
export async function getItemStockEntryDefaultsService(
  workOrderId: string,
  itemId: string,
): Promise<StockEntryDefaults> {
  const { item, part } = await loadItemAndPart(workOrderId, itemId);
  const available = await getPartCurrentStock(part.id);
  const needed = neededUnits(item.quantity);
  return {
    partName: part.name,
    unit: part.unit,
    available,
    needed,
    shortage: Math.max(0, needed - available),
    costReais: part.costCents !== null ? centsToReais(part.costCents) : null,
  };
}

const entryInputSchema = z.object({
  executedByUserId: z.string().trim().min(1, "Selecione quem executou"),
  entryQuantity: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "string" ? Number(v.replace(",", ".")) : v))
    .pipe(z.number().int("Quantidade deve ser inteira").positive("Informe quantas unidades entraram")),
  /** Quanto custou cada unidade comprada. Se informado e diferente do custo
   * cadastrado, passa a ser o novo custo da peça (último preço pago). */
  unitCostReais: z.union([z.string(), z.number()]).optional(),
});

/**
 * Falta estoque na hora de executar um item de peça? Em vez de travar, dá a
 * ENTRADA da quantidade que chegou e executa o item (a baixa automática então
 * fecha o saldo). A entrada fica registrada no histórico da peça com o motivo.
 */
export async function executeItemWithStockEntryService(
  actorUserId: string,
  workOrderId: string,
  itemId: string,
  rawInput: unknown,
) {
  const input = entryInputSchema.parse(rawInput);
  const { workOrder, item, part } = await loadItemAndPart(workOrderId, itemId);

  await createStockMovement({
    partId: part.id,
    type: "ENTRADA",
    quantity: input.entryQuantity,
    reason: `Entrada na execução da OS ${workOrder.number} — item "${item.description}"`,
    createdByUserId: actorUserId,
  });

  let costUpdated: { from: number | null; to: number } | null = null;
  if (input.unitCostReais !== undefined && String(input.unitCostReais).trim() !== "") {
    const newCost = reaisToCents(input.unitCostReais);
    if (newCost > 0 && newCost !== part.costCents) {
      await updatePart(part.id, { costCents: newCost });
      costUpdated = { from: part.costCents, to: newCost };
    }
  }

  await recordAuditLog({
    userId: actorUserId,
    action: "STOCK_ENTRY_ON_EXECUTION",
    entityType: "work_order_item",
    entityId: itemId,
    metadata: { workOrderId, partId: part.id, entryQuantity: input.entryQuantity, costUpdated },
  });

  return setWorkOrderItemStatusService(actorUserId, workOrderId, itemId, "EXECUTADO", {
    executedByUserId: input.executedByUserId,
  });
}
