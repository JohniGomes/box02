import { withTransaction } from "@/lib/db/transaction";
import { findWorkOrderById, lockWorkOrderById, setWorkOrderQuoteSource } from "@/lib/db/repositories/workOrders";
import {
  insertWorkOrderItems,
  listWorkOrderItemsByWorkOrder,
  setWorkOrderItemSourceQuoteItem,
  setWorkOrderItemStatus,
  updateWorkOrderItemTextAndPrice,
} from "@/lib/db/repositories/workOrderItems";
import { findQuoteById } from "@/lib/db/repositories/quotes";
import { findQuoteVersionById, findQuoteVersionByNumber } from "@/lib/db/repositories/quoteVersions";
import { listQuoteItemsByVersion } from "@/lib/db/repositories/quoteItems";
import { recordAuditLog } from "@/lib/db/repositories/auditLog";
import { lineTotalCents } from "@/lib/money";
import { WorkOrderNotFoundError } from "./errors";
import { WorkOrderCorrectionError } from "./service";
import {
  autoPair,
  type SyncAdditional,
  type SyncApplyChoice,
  type SyncOsItem,
  type SyncQuoteItem,
} from "./quoteSync";

export interface QuoteSyncAdjustments {
  discountType: "PERCENTUAL" | "FIXO" | null;
  discountValue: number | null;
  discountReason: string | null;
  surchargeType: "PERCENTUAL" | "FIXO" | null;
  surchargeValue: number | null;
}

export type QuoteSyncPreview =
  | { available: false; reason: string }
  | {
      available: true;
      workOrderNumber: string;
      fromVersionNumber: number;
      toVersionNumber: number;
      osItems: SyncOsItem[];
      quoteItems: SyncQuoteItem[];
      additionals: SyncAdditional[];
      autoPairs: Record<string, string>;
      /** Desconto/acréscimo da OS hoje e o da versão nova. */
      currentAdjustments: QuoteSyncAdjustments;
      newAdjustments: QuoteSyncAdjustments;
      adjustmentsDiffer: boolean;
    };

const toSyncOs = (i: Awaited<ReturnType<typeof listWorkOrderItemsByWorkOrder>>[number]): SyncOsItem => ({
  id: i.id,
  type: i.type,
  description: i.description,
  quantity: Number(i.quantity),
  unitPriceCents: i.unitPriceCents,
  totalCents: i.totalCents,
  status: i.status,
  serviceId: i.serviceId,
  partId: i.partId,
});

const toSyncQuote = (i: Awaited<ReturnType<typeof listQuoteItemsByVersion>>[number]): SyncQuoteItem => ({
  id: i.id,
  type: i.type,
  description: i.description,
  quantity: Number(i.quantity),
  unitPriceCents: i.unitPriceCents,
  totalCents: i.totalCents,
  serviceId: i.serviceId,
  partId: i.partId,
});

/** Carrega a OS e a versão do orçamento que passou a valer, ou explica por que não dá para sincronizar. */
async function loadSyncContext(workOrderId: string) {
  const workOrder = await findWorkOrderById(workOrderId);
  if (!workOrder) throw new WorkOrderNotFoundError(workOrderId);
  if (workOrder.status === "ENTREGUE" || workOrder.status === "CANCELADA") {
    return { ok: false as const, error: "A OS já foi entregue ou cancelada: não dá para sincronizar com o orçamento." };
  }
  if (!workOrder.sourceQuoteVersionId) return { ok: false as const, error: "Esta OS não veio de um orçamento." };

  const sourceVersion = await findQuoteVersionById(workOrder.sourceQuoteVersionId);
  if (!sourceVersion) return { ok: false as const, error: "O orçamento de origem desta OS não foi encontrado." };
  const quote = await findQuoteById(sourceVersion.quoteId);
  if (!quote) return { ok: false as const, error: "O orçamento de origem desta OS não foi encontrado." };

  const target = await findQuoteVersionByNumber(quote.id, quote.currentVersionNumber);
  if (!target || target.versionNumber <= sourceVersion.versionNumber) {
    return { ok: false as const, error: "Não há versão mais nova do orçamento do que a que gerou esta OS." };
  }
  if (target.status !== "APROVADO" && target.status !== "APROVADO_PARCIAL") {
    return {
      ok: false as const,
      error: `A versão ${target.versionNumber} do orçamento ainda não foi aprovada pelo cliente. Envie o link ou registre a aprovação antes de sincronizar.`,
    };
  }
  return { ok: true as const, workOrder, sourceVersion, target };
}

/** Prévia da sincronização: o que a OS tem, o que a versão aprovada tem e o pareamento sugerido. Só leitura. */
export async function getQuoteSyncPreviewService(workOrderId: string): Promise<QuoteSyncPreview> {
  const ctx = await loadSyncContext(workOrderId);
  if (!ctx.ok) return { available: false, reason: ctx.error };
  const { workOrder, sourceVersion, target } = ctx;

  const [allOsItems, targetItems] = await Promise.all([listWorkOrderItemsByWorkOrder(workOrderId), listQuoteItemsByVersion(target.id)]);
  const osItems = allOsItems.filter((i) => i.origin === "DO_ORCAMENTO" && i.status !== "CANCELADO").map(toSyncOs);
  const additionals: SyncAdditional[] = allOsItems
    .filter((i) => i.origin === "ADICIONAL_DURANTE_EXECUCAO" && i.status !== "CANCELADO" && i.clientDecision !== "RECUSADO")
    .map((i) => ({ id: i.id, description: i.description, quantity: Number(i.quantity), unitPriceCents: i.unitPriceCents, totalCents: i.totalCents }));
  const quoteItems = targetItems.filter((i) => i.clientDecision === "APROVADO" && i.category !== "INFORMATIVO").map(toSyncQuote);

  const currentAdjustments: QuoteSyncAdjustments = {
    discountType: workOrder.discountType,
    discountValue: workOrder.discountValue,
    discountReason: workOrder.discountReason,
    surchargeType: workOrder.surchargeType,
    surchargeValue: workOrder.surchargeValue,
  };
  const newAdjustments: QuoteSyncAdjustments = {
    discountType: target.discountType,
    discountValue: target.discountValue,
    discountReason: target.discountReason,
    surchargeType: target.surchargeType,
    surchargeValue: target.surchargeValue,
  };
  const adjustmentsDiffer =
    currentAdjustments.discountType !== newAdjustments.discountType ||
    currentAdjustments.discountValue !== newAdjustments.discountValue ||
    currentAdjustments.surchargeType !== newAdjustments.surchargeType ||
    currentAdjustments.surchargeValue !== newAdjustments.surchargeValue;

  return {
    available: true,
    workOrderNumber: workOrder.number,
    fromVersionNumber: sourceVersion.versionNumber,
    toVersionNumber: target.versionNumber,
    osItems,
    quoteItems,
    additionals,
    autoPairs: autoPair(osItems, quoteItems),
    currentAdjustments,
    newAdjustments,
    adjustmentsDiffer,
  };
}

export interface QuoteSyncResult {
  updated: number;
  descriptionsOnly: number;
  removed: number;
  added: number;
  skipped: string[];
}

/**
 * Aplica a sincronização escolhida. Revalida tudo no servidor (nunca confia no que veio da tela):
 * - descrição: atualiza sempre; valor e quantidade só em item planejado;
 * - item cancelado por ter saído do orçamento: só se estiver planejado;
 * - item novo entra como planejado (de itens aprovados da versão nova que ainda não têm par);
 * - adicionais da OS nunca são tocados; OS entregue/cancelada não sincroniza.
 * Tudo numa transação, com registro de quem sincronizou e o que mudou.
 */
export async function applyQuoteSyncService(
  actorUserId: string,
  workOrderId: string,
  choice: SyncApplyChoice,
): Promise<QuoteSyncResult> {
  return withTransaction(async (client) => {
    const locked = await lockWorkOrderById(workOrderId, client);
    if (!locked) throw new WorkOrderNotFoundError(workOrderId);

    // Recalcula o contexto dentro da transação (a OS pode ter mudado desde que a tela abriu).
    const ctx = await loadSyncContext(workOrderId);
    if (!ctx.ok) throw new WorkOrderCorrectionError(ctx.error);
    const { workOrder, sourceVersion, target } = ctx;

    const [allOsItems, targetItems] = await Promise.all([
      listWorkOrderItemsByWorkOrder(workOrderId, client),
      listQuoteItemsByVersion(target.id, client),
    ]);
    const osById = new Map(allOsItems.filter((i) => i.origin === "DO_ORCAMENTO" && i.status !== "CANCELADO").map((i) => [i.id, i]));
    const quoteById = new Map(
      targetItems.filter((i) => i.clientDecision === "APROVADO" && i.category !== "INFORMATIVO").map((i) => [i.id, i]),
    );

    const result: QuoteSyncResult = { updated: 0, descriptionsOnly: 0, removed: 0, added: 0, skipped: [] };
    const usedQuote = new Set<string>();
    const touchedOs = new Set<string>();
    const log: { updated: unknown[]; removed: unknown[]; added: unknown[] } = { updated: [], removed: [], added: [] };

    for (const u of choice.updates) {
      const osItem = osById.get(u.osItemId);
      const q = quoteById.get(u.quoteItemId);
      if (!osItem || !q || usedQuote.has(q.id) || touchedOs.has(osItem.id)) {
        result.skipped.push("Uma linha da comparação mudou e foi ignorada: reabra a tela e confira.");
        continue;
      }
      usedQuote.add(q.id);
      touchedOs.add(osItem.id);

      const planned = osItem.status === "PLANEJADO";
      const newQuantity = Number(q.quantity);
      const change: { description?: string; unitPriceCents?: number; quantity?: number; totalCents?: number } = {};
      if (osItem.description.trim() !== q.description.trim()) change.description = q.description;
      const valueChanged = osItem.unitPriceCents !== q.unitPriceCents || Number(osItem.quantity) !== newQuantity;
      if (valueChanged) {
        if (planned) {
          change.unitPriceCents = q.unitPriceCents;
          change.quantity = newQuantity;
          change.totalCents = lineTotalCents(newQuantity, q.unitPriceCents);
        } else {
          result.skipped.push(`"${osItem.description}": já executado, o valor e a quantidade não mudaram.`);
        }
      }
      if (Object.keys(change).length > 0) {
        await updateWorkOrderItemTextAndPrice(osItem.id, change, client);
        if (change.unitPriceCents !== undefined || change.quantity !== undefined) result.updated += 1;
        else result.descriptionsOnly += 1;
        log.updated.push({
          itemId: osItem.id,
          before: { description: osItem.description, unitPriceCents: osItem.unitPriceCents, quantity: Number(osItem.quantity) },
          after: { description: change.description ?? osItem.description, unitPriceCents: change.unitPriceCents ?? osItem.unitPriceCents, quantity: change.quantity ?? Number(osItem.quantity) },
        });
      }
      await setWorkOrderItemSourceQuoteItem(osItem.id, q.id, client);
    }

    for (const id of choice.removals) {
      const osItem = osById.get(id);
      if (!osItem || touchedOs.has(id)) continue;
      if (osItem.status !== "PLANEJADO") {
        result.skipped.push(`"${osItem.description}": já executado, não foi cancelado.`);
        continue;
      }
      touchedOs.add(id);
      await setWorkOrderItemStatus(id, "CANCELADO", { cancelReason: `Removido na versão ${target.versionNumber} do orçamento` }, client);
      result.removed += 1;
      log.removed.push({ itemId: id, description: osItem.description, totalCents: osItem.totalCents });
    }

    const toAdd = choice.additions
      .filter((id) => quoteById.has(id) && !usedQuote.has(id))
      .map((id) => quoteById.get(id)!);
    if (toAdd.length > 0) {
      await insertWorkOrderItems(
        toAdd.map((qi) => ({
          workOrderId,
          type: qi.type,
          description: qi.description,
          quantity: Number(qi.quantity),
          unitPriceCents: qi.unitPriceCents,
          totalCents: qi.totalCents,
          origin: "DO_ORCAMENTO" as const,
          sourceQuoteItemId: qi.id,
          catalogItemType: qi.catalogItemType,
          catalogItemId: qi.catalogItemId,
          serviceId: qi.serviceId,
          partId: qi.partId,
          customerSupplied: qi.customerSupplied,
        })),
        client,
      );
      result.added = toAdd.length;
      for (const qi of toAdd) log.added.push({ quoteItemId: qi.id, description: qi.description, totalCents: qi.totalCents });
    }

    await setWorkOrderQuoteSource(
      workOrderId,
      {
        sourceQuoteVersionId: target.id,
        adjustments: choice.syncAdjustments
          ? {
              discountType: target.discountType,
              discountValue: target.discountValue,
              discountReason: target.discountReason,
              surchargeType: target.surchargeType,
              surchargeValue: target.surchargeValue,
            }
          : undefined,
      },
      client,
    );

    await recordAuditLog({
      userId: actorUserId,
      action: "WORK_ORDER_QUOTE_SYNCED",
      entityType: "work_order",
      entityId: workOrder.id,
      metadata: {
        fromVersionNumber: sourceVersion.versionNumber,
        toVersionNumber: target.versionNumber,
        ...result,
        syncedAdjustments: choice.syncAdjustments,
        details: log,
      },
    });

    return result;
  });
}

