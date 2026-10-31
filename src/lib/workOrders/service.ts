import { withTransaction } from "@/lib/db/transaction";
import { joinNames } from "@/lib/executors/value";
import {
  closeWorkOrder,
  createWorkOrder,
  findWorkOrderById,
  listReturnsOfWorkOrder,
  reactivateCancelledWorkOrder,
  reopenDeliveredWorkOrder,
  setWorkOrderServiceDates,
  lockWorkOrderById,
  registerWorkOrderReceptionAcceptance,
  searchWorkOrders,
  setWorkOrderStatus,
  updateDiagnosisExplanationNotes,
  updatePreExistingDamagesDescription,
  updateWorkOrderCheckIn,
  updateWorkOrderTechnicalNotes,
  type ReceptionChecklistSnapshot,
  type SearchWorkOrdersFilters,
  type WorkOrderRecord,
  type WorkOrderStatus,
} from "@/lib/db/repositories/workOrders";
import {
  findWorkOrderItemByAccessToken,
  findWorkOrderItemById,
  updateWorkOrderItemTextAndPrice,
  insertWorkOrderItems,
  listWorkOrderItemsByWorkOrder,
  lockWorkOrderItemById,
  revokeWorkOrderItemAccessToken,
  setWorkOrderItemAccessToken,
  setWorkOrderItemClientDecision,
  resetWorkOrderItemToPlanned,
  setWorkOrderItemStatus,
  type WorkOrderItemRecord,
  type WorkOrderItemStatus,
} from "@/lib/db/repositories/workOrderItems";
import { createClosure, listClosuresByWorkOrder, markLatestClosureReopened } from "@/lib/db/repositories/workOrderClosures";
import {
  createWorkOrderEvidence,
  deleteWorkOrderEvidence,
  findWorkOrderEvidenceById,
  REPLACED_PART_EVIDENCE_TYPES,
  listWorkOrderEvidences,
  type WorkOrderEvidenceRecord,
} from "@/lib/db/repositories/workOrderEvidences";
import { createId } from "@paralleldrive/cuid2";
import { buildEvidenceStorageKey, createSupabaseStorageClient, type StorageClient } from "@/lib/storage/supabase";
import {
  createWorkOrderPayment,
  setWorkOrderPaymentCardFee,
  findWorkOrderPaymentById,
  listWorkOrderPayments,
  sumWorkOrderPayments,
  type WorkOrderPaymentRecord,
} from "@/lib/db/repositories/workOrderPayments";
import {
  createWorkOrderPaymentRefund,
  listWorkOrderPaymentRefundsByWorkOrder,
  sumRefundsForPayment,
  type WorkOrderPaymentRefundRecord,
} from "@/lib/db/repositories/workOrderPaymentRefunds";
import { findQuoteById } from "@/lib/db/repositories/quotes";
import { findQuoteVersionByNumber } from "@/lib/db/repositories/quoteVersions";
import { listQuoteItemsByVersion } from "@/lib/db/repositories/quoteItems";
import { findCustomerById } from "@/lib/db/repositories/customers";
import { findVehicleById } from "@/lib/db/repositories/vehicles";
import { bumpVehicleMileageIfHigherService } from "@/lib/vehicles/service";
import { InvalidEventDateError, formatDateTimeBR, resolveEventInstant } from "@/lib/dateBr";
import { listReceivables, listYardWorkOrders } from "@/lib/db/repositories/workOrders";
import {
  createWorkOrderDiscount,
  listWorkOrderDiscounts,
  sumWorkOrderDiscounts,
  type WorkOrderDiscountRecord,
} from "@/lib/db/repositories/workOrderDiscounts";
import { assertServiceIsActive } from "@/lib/services/service";
import { assertPartIsActive } from "@/lib/inventory/service";
import { findPartById, findPartByIdForUpdate, getPartCurrentStock } from "@/lib/db/repositories/parts";
import { findServiceById } from "@/lib/db/repositories/services";
import { createStockMovement, getReturnedQuantityForWorkOrderItem } from "@/lib/db/repositories/stockMovements";
import { InsufficientStockError } from "@/lib/inventory/errors";
import { recordAuditLog } from "@/lib/db/repositories/auditLog";
import { generateWorkOrderNumber } from "./numbering";
import { computeAdditionalItemExpiresAt, generateAdditionalItemAccessToken } from "./additionalItemToken";
import { computeQuoteTotals, formatBRL, lineTotalCents, reaisToCents } from "@/lib/money";
import {
  additionalItemDecisionSchema,
  adjustAdditionalItemSchema,
  undoWorkOrderItemExecutionSchema,
  authorizeAdditionalItemDirectlySchema,
  cancelWorkOrderItemSchema,
  cancelWorkOrderSchema,
  reactivateWorkOrderSchema,
  correctServiceDateSchema,
  reopenWorkOrderSchema,
  correctWorkOrderItemExecutorSchema,
  createAdditionalItemSchema,
  createWorkOrderEvidenceMetadataSchema,
  createWorkOrderWithoutQuoteSchema,
  executeWorkOrderItemSchema,
  refundWorkOrderPaymentSchema,
  registerWorkOrderPaymentSchema,
  registerWorkOrderPaymentsSchema,
  setPaymentCardFeeSchema,
  updateDiagnosisExplanationSchema,
  updatePreExistingDamagesSchema,
  updateWorkOrderCheckInSchema,
  updateTechnicalNotesSchema,
  workOrderCheckInSchema,
  workOrderDeliverySchema,
  workOrderReceptionAcceptanceSchema,
} from "@/lib/validation/workOrder";
import {
  AdditionalItemAccessTokenNotFoundError,
  AdditionalItemAlreadyDecidedError,
  AdditionalItemNotAuthorizedError,
  AdditionalItemNotEligibleError,
  InvalidExecutorUserError,
  InvalidWorkOrderItemTransitionError,
  InvalidWorkOrderTransitionError,
  QuoteNotApprovedError,
  WorkOrderDeliveryChecklistPendingError,
  WorkOrderEvidenceLockedError,
  WorkOrderEvidenceNotFoundError,
  WorkOrderHasPendingItemsError,
  WorkOrderItemNotFoundError,
  WorkOrderNotDeliveredError,
  WorkOrderNotFoundError,
  WorkOrderPaymentDateError,
  WorkOrderPaymentExceedsBalanceError,
  WorkOrderPaymentNotFoundError,
  WorkOrderPaymentRefundExceedsAmountError,
  WorkOrderReceptionAlreadyAcceptedError,
  WorkOrderReceptionNotAcceptedError,
  WorkOrderReceptionIncompleteError,
  WorkOrderReturnNotDeliveredError,
  WorkOrderNotCancelledError,
  WorkOrderNotDeliveredForCorrectionError,
} from "./errors";
import { findWorkOrderChecklist, listWorkOrderChecklistItems } from "@/lib/db/repositories/workOrderChecklists";
import { VehicleCustomerNotFoundError } from "@/lib/vehicles/errors";
import { VehicleNotOwnedByCustomerError } from "@/lib/quotes/errors";
import { findLastStatusChangeTarget, listAuditLogsForEntity } from "@/lib/db/repositories/auditLog";
import { findUserById } from "@/lib/db/repositories/users";
import { findExecutorById } from "@/lib/db/repositories/executors";
import { isDeliveryChecklistRequired, isDetailedStagesEnabled, isReceptionRequiredForExecution } from "@/lib/settings/service";

/** Máquina de estados da OS — qualquer par fora daqui é rejeitado. */
const ALLOWED_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  ABERTA: ["EM_DIAGNOSTICO", "EM_EXECUCAO", "CANCELADA"],
  EM_DIAGNOSTICO: ["EM_EXECUCAO", "CANCELADA"],
  // "Pronta" também vale direto de Em execução / Aguardando peça (sem obrigar o Teste final), e dá para
  // voltar de Pronta para Em execução se faltou algo. A entrega continua saindo de qualquer etapa aberta
  // no modo simples (ver closeWorkOrderService).
  EM_EXECUCAO: ["AGUARDANDO_PECA", "TESTE_FINAL", "PRONTA", "CANCELADA"],
  AGUARDANDO_PECA: ["EM_EXECUCAO", "PRONTA", "CANCELADA"],
  TESTE_FINAL: ["EM_EXECUCAO", "PRONTA", "CANCELADA"],
  PRONTA: ["EM_EXECUCAO", "ENTREGUE", "CANCELADA"],
  ENTREGUE: [], // reabertura chega na Sub-etapa 3, por uma ação própria — não por esta transição genérica
  CANCELADA: [],
};

function assertTransitionAllowed(from: WorkOrderStatus, to: WorkOrderStatus) {
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    throw new InvalidWorkOrderTransitionError(
      `Não é possível mudar a OS de "${from}" para "${to}".`,
    );
  }
}

async function assertVehicleBelongsToCustomer(customerId: string, vehicleId: string) {
  const customer = await findCustomerById(customerId);
  if (!customer) throw new VehicleCustomerNotFoundError(customerId);
  const vehicle = await findVehicleById(vehicleId);
  if (!vehicle) throw new WorkOrderNotFoundError(vehicleId);
  if (vehicle.customerId !== customerId) {
    throw new VehicleNotOwnedByCustomerError();
  }
  return { customer, vehicle };
}

// ============================================================
// Criação
// ============================================================

export interface CreateWorkOrderResult {
  workOrder: WorkOrderRecord;
  items: WorkOrderItemRecord[];
}

export async function createWorkOrderFromQuoteService(
  actorUserId: string,
  quoteId: string,
  rawCheckIn: unknown,
): Promise<CreateWorkOrderResult> {
  const checkIn = workOrderCheckInSchema.parse(rawCheckIn);

  const quote = await findQuoteById(quoteId);
  if (!quote) throw new WorkOrderNotFoundError(quoteId);

  const version = await findQuoteVersionByNumber(quoteId, quote.currentVersionNumber);
  if (!version || (version.status !== "APROVADO" && version.status !== "APROVADO_PARCIAL")) {
    throw new QuoteNotApprovedError();
  }

  const { customer, vehicle } = await assertVehicleBelongsToCustomer(quote.customerId, quote.vehicleId);

  // Ciclo C1: filtro principal é clientDecision === "APROVADO" — como
  // INFORMATIVO nunca recebe uma decisão (bloqueado no servidor, ver
  // submitPublicQuoteDecisionService), ele já nunca passaria aqui. A
  // segunda condição é defesa em profundidade explícita, pedida para
  // deixar a regra clara no código, não só implícita no comportamento.
  const approvedQuoteItems = (await listQuoteItemsByVersion(version.id)).filter(
    (i) => i.clientDecision === "APROVADO" && i.category !== "INFORMATIVO",
  );

  const number = await generateWorkOrderNumber();

  // Queixa e KM: o que foi digitado agora vale; se vier vazio, usa o do orçamento.
  const customerComplaint = checkIn.customerComplaint ?? quote.customerComplaint ?? undefined;
  const mileageAtEntry = checkIn.mileageAtEntry ?? quote.mileageAtEntry ?? undefined;

  return withTransaction(async (client) => {
    const workOrder = await createWorkOrder(
      {
        number,
        customerId: quote.customerId,
        vehicleId: quote.vehicleId,
        sourceQuoteVersionId: version.id,
        mileageAtEntry: mileageAtEntry,
        customerComplaint: customerComplaint,
        diagnosis: checkIn.diagnosis,
        discountType: version.discountType,
        discountValue: version.discountValue,
        discountReason: version.discountReason,
        surchargeType: version.surchargeType,
        surchargeValue: version.surchargeValue,
        customerNameSnapshot: customer.legalName,
        vehiclePlateSnapshot: vehicle.plate,
        vehicleDescriptionSnapshot: [vehicle.brand, vehicle.model].filter(Boolean).join(" ") || null,
        createdByUserId: actorUserId,
      },
      client,
    );

    const items = approvedQuoteItems.length
      ? await insertWorkOrderItems(
          approvedQuoteItems.map((qi) => ({
            workOrderId: workOrder.id,
            type: qi.type,
            description: qi.description,
            quantity: Number(qi.quantity),
            unitPriceCents: qi.unitPriceCents,
            totalCents: qi.totalCents,
            origin: "DO_ORCAMENTO" as const,
            sourceQuoteItemId: qi.id,
            catalogItemType: qi.catalogItemType,
            catalogItemId: qi.catalogItemId,
            // Copia o serviceId do item de orçamento tal como está —
            // NUNCA revalida contra o catálogo aqui. É o mesmo princípio
            // de congelamento já usado para description/unitPriceCents:
            // o que foi negociado no orçamento é o que vale, mesmo que o
            // serviço tenha sido editado/inativado depois (seção 5 do
            // Ciclo B).
            serviceId: qi.serviceId,
            partId: qi.partId,
            customerSupplied: qi.customerSupplied,
          })),
          client,
        )
      : [];

    await recordAuditLog({
      userId: actorUserId,
      action: "WORK_ORDER_CREATED",
      entityType: "work_order",
      entityId: workOrder.id,
      metadata: { sourceQuoteVersionId: version.id, itemCount: items.length },
    });

    return { workOrder, items };
  }).then(async (result) => {
    if (mileageAtEntry !== undefined) {
      await bumpVehicleMileageIfHigherService(actorUserId, quote.vehicleId, mileageAtEntry);
    }
    return result;
  });
}

function toAdjustmentInternal(
  type: "PERCENTUAL" | "FIXO" | undefined,
  value: string | number | undefined,
): number | undefined {
  if (value === undefined || value === "") return undefined;
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return undefined;
  return type === "PERCENTUAL" ? Math.round(n * 100) : reaisToCents(n);
}

export async function createWorkOrderWithoutQuoteService(
  actorUserId: string,
  rawInput: unknown,
  opts: { returnOfWorkOrderId?: string } = {},
): Promise<CreateWorkOrderResult> {
  const input = createWorkOrderWithoutQuoteSchema.parse(rawInput);
  const { customer, vehicle } = await assertVehicleBelongsToCustomer(input.customerId, input.vehicleId);

  const number = await generateWorkOrderNumber();

  await assertServiceIdsActive(input.items.map((i) => i.serviceId));
  await assertPartIdsActive(input.items.map((i) => i.partId));

  const preparedItems = input.items.map((item) => {
    const unitPriceCents = reaisToCents(item.unitPriceReais);
    return {
      type: item.type,
      description: item.description,
      quantity: item.quantity,
      unitPriceCents,
      totalCents: lineTotalCents(item.quantity, unitPriceCents),
      serviceId: item.serviceId ?? null,
      partId: item.partId ?? null,
    };
  });

  const result = await withTransaction(async (client) => {
    const workOrder = await createWorkOrder(
      {
        number,
        customerId: input.customerId,
        vehicleId: input.vehicleId,
        sourceQuoteVersionId: null,
        returnOfWorkOrderId: opts.returnOfWorkOrderId ?? null,
        mileageAtEntry: input.mileageAtEntry,
        customerComplaint: input.customerComplaint,
        diagnosis: input.diagnosis,
        discountType: input.discountType ?? null,
        discountValue: toAdjustmentInternal(input.discountType, input.discountValue) ?? null,
        surchargeType: input.surchargeType ?? null,
        surchargeValue: toAdjustmentInternal(input.surchargeType, input.surchargeValue) ?? null,
        customerNameSnapshot: customer.legalName,
        vehiclePlateSnapshot: vehicle.plate,
        vehicleDescriptionSnapshot: [vehicle.brand, vehicle.model].filter(Boolean).join(" ") || null,
        createdByUserId: actorUserId,
      },
      client,
    );

    const items = preparedItems.length
      ? await insertWorkOrderItems(
          preparedItems.map((item) => ({
            workOrderId: workOrder.id,
            ...item,
            origin: "SEM_ORCAMENTO" as const,
          })),
          client,
        )
      : [];

    await recordAuditLog({
      userId: actorUserId,
      action: "WORK_ORDER_CREATED",
      entityType: "work_order",
      entityId: workOrder.id,
      metadata: { sourceQuoteVersionId: null, itemCount: items.length },
    });

    return { workOrder, items };
  });

  if (input.mileageAtEntry !== undefined) {
    await bumpVehicleMileageIfHigherService(actorUserId, input.vehicleId, input.mileageAtEntry);
  }
  return result;
}

// ============================================================
// Transições de status
// ============================================================

export interface WorkOrderReturnResult {
  workOrder: WorkOrderRecord;
  /** true = já havia um retorno em aberto e ele foi reaproveitado (nada novo foi criado). */
  reused: boolean;
}

/**
 * Abre um retorno: nova OS (sem orçamento) para o mesmo cliente e veículo de uma
 * OS já entregue, ligada à original, com a queixa já começando por
 * "Retorno da OS-XXXX". Se já existe um retorno ainda em andamento, devolve esse
 * em vez de criar outro. A OS original não é alterada.
 */
export async function openWorkOrderReturnService(
  actorUserId: string,
  originalWorkOrderId: string,
): Promise<WorkOrderReturnResult> {
  const original = await findWorkOrderById(originalWorkOrderId);
  if (!original) throw new WorkOrderNotFoundError(originalWorkOrderId);
  if (original.status !== "ENTREGUE") throw new WorkOrderReturnNotDeliveredError();

  const open = (await listReturnsOfWorkOrder(original.id)).find(
    (r) => r.status !== "ENTREGUE" && r.status !== "CANCELADA",
  );
  if (open) {
    const existing = await findWorkOrderById(open.id);
    if (existing) return { workOrder: existing, reused: true };
  }

  const deliveredOn = original.deliveredAt
    ? ` (entregue em ${original.deliveredAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })})`
    : "";
  const { workOrder } = await createWorkOrderWithoutQuoteService(
    actorUserId,
    {
      customerId: original.customerId,
      vehicleId: original.vehicleId,
      customerComplaint: `Retorno da ${original.number}${deliveredOn}:`,
      items: [],
    },
    { returnOfWorkOrderId: original.id },
  );
  await recordAuditLog({
    userId: actorUserId,
    action: "WORK_ORDER_RETURN_OPENED",
    entityType: "work_order",
    entityId: workOrder.id,
    metadata: { returnOfWorkOrderId: original.id, returnOfNumber: original.number },
  });
  return { workOrder, reused: false };
}

export async function listWorkOrderReturnsService(workOrderId: string) {
  return listReturnsOfWorkOrder(workOrderId);
}

export async function setWorkOrderStatusService(
  actorUserId: string,
  workOrderId: string,
  newStatus: WorkOrderStatus,
): Promise<WorkOrderRecord> {
  const existing = await findWorkOrderById(workOrderId);
  if (!existing) throw new WorkOrderNotFoundError(workOrderId);

  assertTransitionAllowed(existing.status, newStatus);

  // Ciclo F, DEC-1: transição para EM_EXECUCAO exige aceite de recepção
  // já registrado. EM_DIAGNOSTICO e CANCELADA nunca são afetados por
  // esta checagem — só passam por assertTransitionAllowed acima.
  // A trava pode ser desligada em Configurações → Regras (padrão: ligada).
  // Desligada, a OS avança e o termo segue como pendência visível.
  const receptionPending = !existing.receptionAcceptedAt;
  if (newStatus === "EM_EXECUCAO" && receptionPending && (await isReceptionRequiredForExecution())) {
    throw new WorkOrderReceptionNotAcceptedError();
  }

  const extra: Parameters<typeof setWorkOrderStatus>[2] = {};
  if (newStatus === "EM_EXECUCAO" && !existing.startedAt) extra.startedAt = new Date();
  if (newStatus === "TESTE_FINAL" || (newStatus === "PRONTA" && !existing.completedAt)) extra.completedAt = new Date();

  const updated = await setWorkOrderStatus(workOrderId, newStatus, extra);
  if (!updated) throw new WorkOrderNotFoundError(workOrderId);

  await recordAuditLog({
    userId: actorUserId,
    action: "WORK_ORDER_STATUS_CHANGED",
    entityType: "work_order",
    entityId: workOrderId,
    metadata: {
      from: existing.status,
      to: newStatus,
      ...(newStatus === "EM_EXECUCAO" && receptionPending ? { receptionPending: true } : {}),
    },
  });

  return updated;
}

export async function cancelWorkOrderService(
  actorUserId: string,
  workOrderId: string,
  rawInput: unknown,
): Promise<WorkOrderRecord> {
  const input = cancelWorkOrderSchema.parse(rawInput);
  const existing = await findWorkOrderById(workOrderId);
  if (!existing) throw new WorkOrderNotFoundError(workOrderId);

  assertTransitionAllowed(existing.status, "CANCELADA");

  return withTransaction(async (client) => {
    const updated = await setWorkOrderStatus(
      workOrderId,
      "CANCELADA",
      { cancelledAt: new Date(), cancelReason: input.reason },
      client,
    );
    if (!updated) throw new WorkOrderNotFoundError(workOrderId);

    // Pergunta "Devolver as peças ao estoque?": cada item executado com peça volta como uma
    // ENTRADA nova ligada ao item (nada é apagado nem editado, e nunca devolve duas vezes).
    const returned: { description: string; quantity: number }[] = [];
    if (input.returnParts) {
      const items = await listWorkOrderItemsByWorkOrder(workOrderId, client);
      for (const item of items) {
        if (item.status !== "EXECUTADO" || !item.partId || item.customerSupplied) continue;
        if ((await getReturnedQuantityForWorkOrderItem(item.id, client)) > 0) continue;
        const quantity = Math.max(1, Math.round(Number(item.quantity)));
        await createStockMovement(
          {
            partId: item.partId,
            type: "ENTRADA",
            quantity,
            reason: `Devolução ao estoque — OS ${existing.number} cancelada, item "${item.description}"`,
            workOrderItemId: item.id,
            source: "OS_DEVOLUCAO",
            createdByUserId: actorUserId,
          },
          client,
        );
        returned.push({ description: item.description, quantity });
      }
    }

    await recordAuditLog({
      userId: actorUserId,
      action: "WORK_ORDER_CANCELLED",
      entityType: "work_order",
      entityId: workOrderId,
      metadata: { reason: input.reason, previousStatus: existing.status, returnParts: Boolean(input.returnParts), returnedParts: returned },
    });

    return updated;
  });
}

/** Peças que podem ser devolvidas ao estoque se a OS for cancelada (e ainda não foram). */
export async function listReturnablePartsService(workOrderId: string): Promise<{ itemId: string; description: string; quantity: number }[]> {
  const items = await listWorkOrderItemsByWorkOrder(workOrderId);
  const out: { itemId: string; description: string; quantity: number }[] = [];
  for (const item of items) {
    if (item.status !== "EXECUTADO" || !item.partId || item.customerSupplied) continue;
    if ((await getReturnedQuantityForWorkOrderItem(item.id)) > 0) continue;
    out.push({ itemId: item.id, description: item.description, quantity: Math.max(1, Math.round(Number(item.quantity))) });
  }
  return out;
}

const REACTIVATABLE_STATUSES: WorkOrderStatus[] = [
  "ABERTA",
  "EM_DIAGNOSTICO",
  "EM_EXECUCAO",
  "AGUARDANDO_PECA",
  "TESTE_FINAL",
  "PRONTA",
];

/**
 * Desfaz um cancelamento feito por engano. A OS volta para o status em que
 * estava antes de ser cancelada (guardado no cancelamento; para cancelamentos
 * antigos, o último status do histórico; sem nada disso, "Aberta"). Exige
 * motivo e fica registrado quem reativou e o motivo do cancelamento anterior.
 */
export class WorkOrderCorrectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkOrderCorrectionError";
  }
}

/**
 * Corrige a data (e horário, opcional) do atendimento de uma OS ENTREGUE.
 * Muda só `deliveredAt` (e puxa a entrada para trás se ela ficaria depois).
 * Pagamentos, itens, estoque e fechamento NÃO mudam. Fica registrado quem
 * corrigiu, por quê, e o valor antigo e o novo.
 */
export async function correctWorkOrderServiceDateService(
  actorUserId: string,
  workOrderId: string,
  rawInput: unknown,
): Promise<WorkOrderRecord> {
  const input = correctServiceDateSchema.parse(rawInput);
  const existing = await findWorkOrderById(workOrderId);
  if (!existing) throw new WorkOrderNotFoundError(workOrderId);
  if (existing.status !== "ENTREGUE") throw new WorkOrderNotDeliveredForCorrectionError();

  let instant: Date;
  try {
    instant = resolveEventInstant(input.serviceDate, input.serviceTime);
  } catch (err) {
    if (err instanceof InvalidEventDateError) throw new WorkOrderCorrectionError(err.message);
    throw err;
  }

  const updated = await setWorkOrderServiceDates(workOrderId, { deliveredAt: instant });
  if (!updated) throw new WorkOrderNotDeliveredForCorrectionError();

  await recordAuditLog({
    userId: actorUserId,
    action: "WORK_ORDER_SERVICE_DATE_CORRECTED",
    entityType: "work_order",
    entityId: workOrderId,
    metadata: {
      reason: input.reason,
      previousDeliveredAt: existing.deliveredAt,
      newDeliveredAt: updated.deliveredAt,
      previousEntryAt: existing.entryAt,
      newEntryAt: updated.entryAt,
    },
  });
  return updated;
}

/**
 * Reabre uma OS ENTREGUE: volta para "Pronta" e limpa a data de entrega, com
 * motivo. Pagamentos recebidos, itens e baixas de estoque são MANTIDOS — nada
 * é apagado; para desfazer um pagamento use o estorno, que continua separado.
 * O fechamento anterior fica marcado como reaberto (quem, quando, por quê).
 */
export async function reopenWorkOrderService(
  actorUserId: string,
  workOrderId: string,
  rawInput: unknown,
): Promise<WorkOrderRecord> {
  const input = reopenWorkOrderSchema.parse(rawInput);

  return withTransaction(async (client) => {
    const existing = await lockWorkOrderById(workOrderId, client);
    if (!existing) throw new WorkOrderNotFoundError(workOrderId);
    if (existing.status !== "ENTREGUE") throw new WorkOrderNotDeliveredForCorrectionError();

    const paidCents = await sumWorkOrderPayments(workOrderId, client);

    const updated = await reopenDeliveredWorkOrder(workOrderId, client);
    if (!updated) throw new WorkOrderNotDeliveredForCorrectionError();
    await markLatestClosureReopened(workOrderId, { reopenedByUserId: actorUserId, reason: input.reason }, client);

    await recordAuditLog({
      userId: actorUserId,
      action: "WORK_ORDER_REOPENED",
      entityType: "work_order",
      entityId: workOrderId,
      metadata: {
        reason: input.reason,
        previousStatus: existing.status,
        previousDeliveredAt: existing.deliveredAt,
        previousTotalCents: existing.totalCents,
        paidCentsKept: paidCents,
        deliveryAcceptedName: existing.deliveryAcceptedName,
      },
    });
    return updated;
  });
}

/**
 * Corrige a descrição e/ou o valor de um item da OS (inclusive os que vieram do orçamento).
 * - Descrição: vale em qualquer status da OS (mesmo entregue), sem mexer em valores nem estoque.
 * - Valor: só com a OS aberta e o item não cancelado, com motivo; itens adicionais usam o fluxo próprio
 *   (precisam da autorização do cliente). Quantidade não muda aqui (mexe no estoque).
 * Sempre fica registrado quem mudou, quando, o que era e o que ficou.
 */
export async function correctWorkOrderItemService(
  actorUserId: string,
  workOrderId: string,
  itemId: string,
  rawInput: { description?: string; unitPriceReais?: string; reason?: string },
): Promise<WorkOrderItemRecord> {
  const workOrder = await findWorkOrderById(workOrderId);
  if (!workOrder) throw new WorkOrderNotFoundError(workOrderId);
  const item = await findWorkOrderItemById(itemId);
  if (!item || item.workOrderId !== workOrderId) throw new WorkOrderItemNotFoundError(itemId);

  const description = rawInput.description?.trim();
  if (description !== undefined && description.length < 2) {
    throw new WorkOrderCorrectionError("A descrição precisa ter pelo menos 2 letras.");
  }
  const descriptionChanged = description !== undefined && description !== item.description;

  let newUnitPriceCents: number | undefined;
  const priceText = rawInput.unitPriceReais?.trim();
  if (priceText) {
    const cents = reaisToCents(priceText);
    if (!Number.isFinite(cents) || cents < 0) throw new WorkOrderCorrectionError("Valor inválido.");
    if (cents !== item.unitPriceCents) newUnitPriceCents = cents;
  }

  if (!descriptionChanged && newUnitPriceCents === undefined) {
    throw new WorkOrderCorrectionError("Nada para corrigir: o texto e o valor são os mesmos.");
  }

  const reason = rawInput.reason?.trim() ?? "";
  if (newUnitPriceCents !== undefined) {
    if (workOrder.status === "ENTREGUE" || workOrder.status === "CANCELADA") {
      throw new WorkOrderCorrectionError(
        'Esta OS já foi fechada: para mudar valores, use "Reabrir OS" nas correções da OS.',
      );
    }
    if (item.status === "CANCELADO") throw new WorkOrderCorrectionError("Este item foi cancelado.");
    if (item.origin === "ADICIONAL_DURANTE_EXECUCAO") {
      throw new WorkOrderCorrectionError('O valor de um adicional se corrige em "Adicionais" (precisa da autorização do cliente).');
    }
    if (reason.length < 3) throw new WorkOrderCorrectionError("Informe o motivo da mudança de valor.");
  }

  const totalCents = newUnitPriceCents !== undefined ? lineTotalCents(Number(item.quantity), newUnitPriceCents) : undefined;
  const updated = await updateWorkOrderItemTextAndPrice(itemId, {
    description: descriptionChanged ? description : undefined,
    unitPriceCents: newUnitPriceCents,
    totalCents,
  });
  if (!updated) throw new WorkOrderItemNotFoundError(itemId);

  await recordAuditLog({
    userId: actorUserId,
    action: "WORK_ORDER_ITEM_EDITED",
    entityType: "work_order",
    entityId: workOrderId,
    metadata: {
      itemId,
      before: { description: item.description, unitPriceCents: item.unitPriceCents, totalCents: item.totalCents },
      after: { description: updated.description, unitPriceCents: updated.unitPriceCents, totalCents: updated.totalCents },
      ...(reason ? { reason } : {}),
    },
  });

  return updated;
}

export interface WorkOrderCorrectionEntry {
  id: string;
  kind: "DATA" | "REABERTURA" | "ITEM" | "SINCRONIZACAO";
  at: Date;
  by: string | null;
  reason: string | null;
  from: string | null;
  to: string | null;
}

/** Histórico das correções de data e reaberturas de uma OS. */
export async function listWorkOrderCorrectionsService(workOrderId: string): Promise<WorkOrderCorrectionEntry[]> {
  const rows = await listAuditLogsForEntity("work_order", workOrderId, [
    "WORK_ORDER_SERVICE_DATE_CORRECTED",
    "WORK_ORDER_REOPENED",
    "WORK_ORDER_ITEM_EDITED",
    "WORK_ORDER_QUOTE_SYNCED",
  ]);
  const fmt = (v: unknown) => (typeof v === "string" || v instanceof Date ? formatDateTimeBR(v) : null);
  return rows.map((r) => {
    const m = r.metadata ?? {};
    if (r.action === "WORK_ORDER_QUOTE_SYNCED") {
      const n = (v: unknown) => (typeof v === "number" ? v : 0);
      return {
        id: r.id,
        kind: "SINCRONIZACAO" as const,
        at: r.createdAt,
        by: r.userName,
        reason: null,
        from: `Orçamento versão ${n(m.fromVersionNumber)}`,
        to: `versão ${n(m.toVersionNumber)}: ${n(m.updated) + n(m.descriptionsOnly)} atualizado(s), ${n(m.removed)} cancelado(s), ${n(m.added)} novo(s)`,
      };
    }
    if (r.action === "WORK_ORDER_ITEM_EDITED") {
      const before = (m.before ?? {}) as { description?: string; unitPriceCents?: number };
      const after = (m.after ?? {}) as { description?: string; unitPriceCents?: number };
      const text = (b: typeof before) => `${b.description ?? "—"}${b.unitPriceCents != null ? ` (${formatBRL(b.unitPriceCents)})` : ""}`;
      return {
        id: r.id,
        kind: "ITEM" as const,
        at: r.createdAt,
        by: r.userName,
        reason: (m.reason as string) ?? null,
        from: text(before),
        to: text(after),
      };
    }
    if (r.action === "WORK_ORDER_REOPENED") {
      return {
        id: r.id,
        kind: "REABERTURA" as const,
        at: r.createdAt,
        by: r.userName,
        reason: (m.reason as string) ?? null,
        from: `Entregue em ${fmt(m.previousDeliveredAt) ?? "—"}`,
        to: "Reaberta (Pronta)",
      };
    }
    return {
      id: r.id,
      kind: "DATA" as const,
      at: r.createdAt,
      by: r.userName,
      reason: (m.reason as string) ?? null,
      from: fmt(m.previousDeliveredAt),
      to: fmt(m.newDeliveredAt),
    };
  });
}

export async function reactivateWorkOrderService(
  actorUserId: string,
  workOrderId: string,
  rawInput: unknown,
): Promise<WorkOrderRecord> {
  const input = reactivateWorkOrderSchema.parse(rawInput);
  const existing = await findWorkOrderById(workOrderId);
  if (!existing) throw new WorkOrderNotFoundError(workOrderId);
  if (existing.status !== "CANCELADA") throw new WorkOrderNotCancelledError();

  const lastStatus = await findLastStatusChangeTarget(workOrderId);
  const previous = (
    lastStatus && (REACTIVATABLE_STATUSES as string[]).includes(lastStatus) ? lastStatus : "ABERTA"
  ) as WorkOrderStatus;

  return withTransaction(async (client) => {
    const updated = await reactivateCancelledWorkOrder(workOrderId, previous, client);
    if (!updated) throw new WorkOrderNotCancelledError();

    // Se as peças tinham sido devolvidas ao cancelar, a OS reativada volta a usá-las: nova saída.
    // Não trava por falta de saldo (o estoque pode ficar negativo para a pessoa acertar depois).
    const rebaixed: { description: string; quantity: number }[] = [];
    const items = await listWorkOrderItemsByWorkOrder(workOrderId, client);
    for (const item of items) {
      if (item.status !== "EXECUTADO" || !item.partId || item.customerSupplied) continue;
      const returned = await getReturnedQuantityForWorkOrderItem(item.id, client);
      if (returned <= 0) continue;
      await findPartByIdForUpdate(item.partId, client);
      await createStockMovement(
        {
          partId: item.partId,
          type: "SAIDA",
          quantity: returned,
          reason: `Nova baixa — OS ${existing.number} reativada, item "${item.description}"`,
          workOrderItemId: item.id,
          source: "OS_REBAIXA",
          createdByUserId: actorUserId,
        },
        client,
      );
      rebaixed.push({ description: item.description, quantity: returned });
    }

    await recordAuditLog({
      userId: actorUserId,
      action: "WORK_ORDER_REACTIVATED",
      entityType: "work_order",
      entityId: workOrderId,
      metadata: { reason: input.reason, restoredStatus: previous, previousCancelReason: existing.cancelReason, rebaixedParts: rebaixed },
    });
    return updated;
  });
}

// ============================================================
// Itens
// ============================================================

export async function setWorkOrderItemStatusService(
  actorUserId: string,
  workOrderId: string,
  itemId: string,
  status: Extract<WorkOrderItemStatus, "EXECUTADO" | "CANCELADO">,
  rawInput?: unknown,
): Promise<WorkOrderItemRecord> {
  const workOrder = await findWorkOrderById(workOrderId);
  if (!workOrder) throw new WorkOrderNotFoundError(workOrderId);
  if (workOrder.status === "ENTREGUE" || workOrder.status === "CANCELADA") {
    throw new InvalidWorkOrderItemTransitionError(
      "Esta OS já está fechada/cancelada — itens não podem mais mudar.",
    );
  }

  let cancelReason: string | undefined;
  let executedByUserId: string | undefined;
  let executedByName: string | null | undefined;
  if (status === "CANCELADO") {
    cancelReason = cancelWorkOrderItemSchema.parse(rawInput).reason;
  }
  if (status === "EXECUTADO") {
    // Ciclo L: executor é sempre explícito. Quando a chamada não informa
    // rawInput (ex.: chamadas programáticas/testes existentes), assume o
    // próprio ator por compatibilidade — mas a UI sempre envia o valor
    // escolhido no seletor, nunca deixa implícito. O executor pode ser um
    // usuário ou um nome da lista de executores (sem login).
    const parsed = rawInput !== undefined ? executeWorkOrderItemSchema.parse(rawInput) : null;
    const resolved = await resolveExecutorInput(parsed ?? { executedByUserId: actorUserId });
    executedByUserId = resolved.executedByUserId;
    executedByName = resolved.executedByName;
  }

  // Correção de concorrência (Sub-etapa 2, risco já identificado na
  // especificação): trava a linha do item durante toda a checagem +
  // escrita, mesmo padrão já usado na decisão do orçamento — impede que
  // duas mudanças de status na mesma linha corram em paralelo.
  return withTransaction(async (client) => {
    const item = await lockWorkOrderItemById(itemId, client);
    if (!item || item.workOrderId !== workOrderId) throw new WorkOrderItemNotFoundError(itemId);
    if (item.status !== "PLANEJADO") {
      throw new InvalidWorkOrderItemTransitionError(
        `Item já está "${item.status}" — só é possível decidir um item enquanto "PLANEJADO".`,
      );
    }

    // AD-4: bloqueio rígido, sem exceção para nenhum perfil — um adicional
    // só pode ser executado com decisão do cliente já registrada.
    if (status === "EXECUTADO" && item.origin === "ADICIONAL_DURANTE_EXECUCAO" && item.clientDecision !== "APROVADO") {
      throw new AdditionalItemNotAuthorizedError();
    }

    // Custo unitário no momento da execução (base do lucro por serviço):
    // peça do estoque = custo atual da peça; serviço do catálogo = custo estimado;
    // peça do cliente = zero. Item digitado à mão fica sem custo (null).
    let unitCostCents: number | null | undefined;
    if (status === "EXECUTADO") {
      if (item.customerSupplied) unitCostCents = 0;
      else if (item.partId) unitCostCents = (await findPartById(item.partId))?.costCents ?? null;
      else if (item.serviceId) unitCostCents = (await findServiceById(item.serviceId))?.costCents ?? null;
      else unitCostCents = null;
    }

    const updated = await setWorkOrderItemStatus(
      itemId,
      status,
      {
        executedAt: status === "EXECUTADO" ? new Date() : undefined,
        executedByUserId,
        executedByName,
        unitCostCents,
        cancelReason,
      },
      client,
    );
    if (!updated) throw new WorkOrderItemNotFoundError(itemId);

    // Baixa automática de estoque: só quando o item (de peça, vinculado a
    // uma peça do estoque) é marcado EXECUTADO — nunca antes (planejado
    // pode ser cancelado sem nunca ter saído do estoque de verdade).
    // Trava a linha da PEÇA (não só do item) para impedir que duas
    // execuções concorrentes da mesma peça leiam o mesmo saldo "antigo" e
    // ambas passem na checagem de estoque suficiente.
    if (status === "EXECUTADO" && item.partId && !item.customerSupplied) {
      const part = await findPartByIdForUpdate(item.partId, client);
      if (part) {
        const quantity = Math.max(1, Math.round(Number(item.quantity)));
        const currentStock = await getPartCurrentStock(item.partId, client);
        if (quantity > currentStock) {
          throw new InsufficientStockError(currentStock, quantity);
        }
        // Se a execução já foi desfeita antes (peça devolvida), esta nova baixa anula a devolução.
        const alreadyReturned = (await getReturnedQuantityForWorkOrderItem(item.id, client)) > 0;
        await createStockMovement(
          {
            partId: item.partId,
            type: "SAIDA",
            quantity,
            reason: `Baixa automática — OS ${workOrder.number}, item "${item.description}"`,
            workOrderItemId: item.id,
            source: alreadyReturned ? "OS_REBAIXA" : "OS_BAIXA",
            createdByUserId: executedByUserId ?? actorUserId,
          },
          client,
        );
      }
    }

    await recordAuditLog({
      userId: actorUserId,
      action: "WORK_ORDER_ITEM_STATUS_CHANGED",
      entityType: "work_order_item",
      entityId: itemId,
      metadata: { workOrderId, to: status, cancelReason, executedByUserId, executedByName },
    });

    return updated;
  });
}

/**
 * Desfazer execução: marcou o item errado como executado. O item volta para "Planejado" e,
 * se deu baixa de peça no estoque, a peça volta. Só com a OS ainda aberta; fica no histórico.
 * Nunca trava por saldo de estoque.
 */
export async function undoWorkOrderItemExecutionService(
  actorUserId: string,
  workOrderId: string,
  itemId: string,
  rawInput: unknown,
): Promise<WorkOrderItemRecord> {
  const input = undoWorkOrderItemExecutionSchema.parse(rawInput);
  const workOrder = await findWorkOrderById(workOrderId);
  if (!workOrder) throw new WorkOrderNotFoundError(workOrderId);
  if (workOrder.status === "ENTREGUE" || workOrder.status === "CANCELADA") {
    throw new InvalidWorkOrderItemTransitionError(
      "Esta OS já está fechada/cancelada — para mexer nos itens, reabra a OS pela correção.",
    );
  }

  return withTransaction(async (client) => {
    const item = await lockWorkOrderItemById(itemId, client);
    if (!item || item.workOrderId !== workOrderId) throw new WorkOrderItemNotFoundError(itemId);
    if (item.status !== "EXECUTADO") {
      throw new InvalidWorkOrderItemTransitionError(`Só dá para desfazer um item "EXECUTADO" (item está "${item.status}").`);
    }

    const updated = await resetWorkOrderItemToPlanned(itemId, client);
    if (!updated) throw new WorkOrderItemNotFoundError(itemId);

    let returnedQuantity = 0;
    if (item.partId && !item.customerSupplied && (await getReturnedQuantityForWorkOrderItem(itemId, client)) <= 0) {
      await findPartByIdForUpdate(item.partId, client);
      returnedQuantity = Math.max(1, Math.round(Number(item.quantity)));
      await createStockMovement(
        {
          partId: item.partId,
          type: "ENTRADA",
          quantity: returnedQuantity,
          reason: `Devolução ao estoque — execução desfeita na OS ${workOrder.number}, item "${item.description}"`,
          workOrderItemId: item.id,
          source: "OS_DEVOLUCAO",
          createdByUserId: actorUserId,
        },
        client,
      );
    }

    await recordAuditLog({
      userId: actorUserId,
      action: "WORK_ORDER_ITEM_EXECUTION_UNDONE",
      entityType: "work_order_item",
      entityId: itemId,
      metadata: {
        workOrderId,
        reason: input.reason,
        returnedQuantity,
        previousExecutedByUserId: item.executedByUserId,
        previousExecutedByName: item.executedByName,
      },
    });
    return updated;
  });
}

/** Resolve "quem executou": um usuário ativo OU um nome da lista de
 * executores (ativo). Sempre validado no servidor. */
async function resolveExecutorInput(input: {
  executedByUserId?: string;
  executorId?: string;
  executorIds?: string[];
}): Promise<{ executedByUserId?: string; executedByName: string | null }> {
  // Executaram juntos: guarda os nomes juntos ("Carlos Eduardo e Mateus"). Cada um é validado.
  if (input.executorIds && input.executorIds.length > 1) {
    const names: string[] = [];
    for (const id of input.executorIds) {
      const executor = await findExecutorById(id);
      if (executor && executor.status === "ATIVO") {
        names.push(executor.name);
        continue;
      }
      const user = await findUserById(id);
      if (user && user.status === "ATIVO") {
        names.push(user.name);
        continue;
      }
      throw new InvalidExecutorUserError();
    }
    return { executedByName: joinNames([...new Set(names)]) };
  }
  if (input.executorId) {
    const executor = await findExecutorById(input.executorId);
    if (!executor || executor.status !== "ATIVO") throw new InvalidExecutorUserError();
    return { executedByName: executor.name };
  }
  const user = await findUserById(input.executedByUserId ?? "");
  if (!user || user.status !== "ATIVO") throw new InvalidExecutorUserError();
  return { executedByUserId: user.id, executedByName: null };
}

/** Ciclo L — corrige quem executou um item já EXECUTADO (campo editável,
 * não write-once: DEC de governança 3.5, já que é um registro técnico
 * interno, não um ponto formal de aceite do cliente). Histórico de
 * correções fica na auditoria (WORK_ORDER_ITEM_EXECUTOR_CORRECTED). */
export async function correctWorkOrderItemExecutorService(
  actorUserId: string,
  workOrderId: string,
  itemId: string,
  rawInput: unknown,
): Promise<WorkOrderItemRecord> {
  const parsedInput = correctWorkOrderItemExecutorSchema.parse(rawInput);

  const workOrder = await findWorkOrderById(workOrderId);
  if (!workOrder) throw new WorkOrderNotFoundError(workOrderId);
  if (workOrder.status === "ENTREGUE" || workOrder.status === "CANCELADA") {
    throw new InvalidWorkOrderItemTransitionError(
      "Esta OS já está fechada/cancelada — itens não podem mais mudar.",
    );
  }

  const resolved = await resolveExecutorInput(parsedInput);
  const newExecutedByUserId = resolved.executedByUserId;

  return withTransaction(async (client) => {
    const item = await lockWorkOrderItemById(itemId, client);
    if (!item || item.workOrderId !== workOrderId) throw new WorkOrderItemNotFoundError(itemId);
    if (item.status !== "EXECUTADO") {
      throw new InvalidWorkOrderItemTransitionError(
        `Só é possível corrigir o executor de um item "EXECUTADO" (item está "${item.status}").`,
      );
    }

    const previousExecutedByUserId = item.executedByUserId;
    const previousExecutedByName = item.executedByName;
    const updated = await setWorkOrderItemStatus(
      itemId,
      "EXECUTADO",
      { executedByUserId: newExecutedByUserId, executedByName: resolved.executedByName },
      client,
    );
    if (!updated) throw new WorkOrderItemNotFoundError(itemId);

    await recordAuditLog({
      userId: actorUserId,
      action: "WORK_ORDER_ITEM_EXECUTOR_CORRECTED",
      entityType: "work_order_item",
      entityId: itemId,
      metadata: {
        workOrderId,
        from: previousExecutedByName ?? previousExecutedByUserId,
        to: resolved.executedByName ?? newExecutedByUserId,
      },
    });

    return updated;
  });
}

// ============================================================
// Fechamento
// ============================================================

export async function closeWorkOrderService(
  actorUserId: string,
  workOrderId: string,
  rawDelivery: unknown,
): Promise<WorkOrderRecord> {
  const delivery = workOrderDeliverySchema.parse(rawDelivery);

  return withTransaction(async (client) => {
    const workOrder = await lockWorkOrderById(workOrderId, client);
    if (!workOrder) throw new WorkOrderNotFoundError(workOrderId);

    // Modo simples (padrão, ver Configurações → Regras): entrega direta de qualquer etapa aberta.
    // Etapas detalhadas ligadas: só a OS "Pronta" pode ser entregue, como sempre foi.
    const skippedStages = ["ABERTA", "EM_DIAGNOSTICO", "EM_EXECUCAO", "AGUARDANDO_PECA", "TESTE_FINAL"].includes(workOrder.status);
    if (skippedStages && !(await isDetailedStagesEnabled())) {
      // A trava do Termo de Recepção continua valendo para quem nunca passou por "Em execução".
      if (
        !workOrder.receptionAcceptedAt &&
        (workOrder.status === "ABERTA" || workOrder.status === "EM_DIAGNOSTICO") &&
        (await isReceptionRequiredForExecution())
      ) {
        throw new WorkOrderReceptionNotAcceptedError();
      }
    } else {
      assertTransitionAllowed(workOrder.status, "ENTREGUE");
    }

    const items = await listWorkOrderItemsByWorkOrder(workOrderId, client);
    if (items.some((i) => i.status === "PLANEJADO")) {
      throw new WorkOrderHasPendingItemsError();
    }

    // Ciclo E / EX-2 (já aprovada): bloqueia só se existir uma instância
    // de checklist de ENTREGA nesta OS com item obrigatório pendente.
    // Ausência de instância (checklist não configurado ou nunca iniciado
    // nesta OS) NUNCA bloqueia — só o item pendente numa instância que
    // de fato existe.
    // A trava pode ser desligada em Configurações → Regras (padrão: ligada).
    // Desligada, a OS é entregue e a pendência fica visível no Início e na auditoria.
    let deliveryChecklistPending = 0;
    const entregaChecklist = await findWorkOrderChecklist({ workOrderId, type: "ENTREGA" }, client);
    if (entregaChecklist) {
      const entregaItems = await listWorkOrderChecklistItems(entregaChecklist.id, client);
      const pending = entregaItems.filter((i) => i.required && !i.checked);
      if (pending.length > 0) {
        if (await isDeliveryChecklistRequired()) {
          throw new WorkOrderDeliveryChecklistPendingError(pending.map((i) => i.description));
        }
        deliveryChecklistPending = pending.length;
      }
    }

    const executedItems = items.filter((i) => i.status === "EXECUTADO");
    const totals = computeQuoteTotals({
      items: executedItems.map((i) => ({ type: i.type, totalCents: i.totalCents })),
      discountType: workOrder.discountType,
      discountValue: workOrder.discountValue,
      surchargeType: workOrder.surchargeType,
      surchargeValue: workOrder.surchargeValue,
    });

    const deliveredAt = new Date();
    const updated = await closeWorkOrder(
      workOrderId,
      {
        totalCents: totals.totalCents,
        deliveredAt,
        deliveryAcceptedName: delivery.deliveryAcceptedName,
        deliveryAcceptedDocument: delivery.deliveryAcceptedDocument ?? null,
        deliveredByUserId: actorUserId,
      },
      client,
    );
    if (!updated) throw new WorkOrderNotFoundError(workOrderId);

    await createClosure(
      { workOrderId, closedByUserId: actorUserId, totalAtClosureCents: totals.totalCents },
      client,
    );

    await recordAuditLog({
      userId: actorUserId,
      action: "WORK_ORDER_CLOSED",
      entityType: "work_order",
      entityId: workOrderId,
      metadata: {
        totalCents: totals.totalCents,
        ...(skippedStages ? { deliveredFromStatus: workOrder.status } : {}),
        ...(deliveryChecklistPending > 0 ? { deliveryChecklistPending } : {}),
      },
    });

    return updated;
  });
}

// ============================================================
// UI do Método BOX 02 — EXPLICAMOS (independente de orçamento)
// ============================================================

/** Sem gate, sem write-once (mais simples de propósito que o Termo de
 * Recepção — o Método não pede aceite formal aqui). */
export async function updateWorkOrderExplanationService(
  actorUserId: string,
  workOrderId: string,
  rawInput: unknown,
): Promise<WorkOrderRecord> {
  const input = updateDiagnosisExplanationSchema.parse(rawInput);

  const existing = await findWorkOrderById(workOrderId);
  if (!existing) throw new WorkOrderNotFoundError(workOrderId);

  const updated = await updateDiagnosisExplanationNotes(workOrderId, input.diagnosisExplanationNotes ?? null);
  if (!updated) throw new WorkOrderNotFoundError(workOrderId);

  await recordAuditLog({
    userId: actorUserId,
    action: "WORK_ORDER_EXPLANATION_UPDATED",
    entityType: "work_order",
    entityId: workOrderId,
  });

  return updated;
}

// ============================================================
// Ciclo G — Entrega Técnica
// ============================================================

/** Isolada — nunca chamada de dentro de closeWorkOrderService/
 * setWorkOrderStatusService. Sem gate, sem write-once, sem interferir
 * no fechamento (mesmo padrão exato de updateWorkOrderExplanationService). */
export async function updateWorkOrderTechnicalNotesService(
  actorUserId: string,
  workOrderId: string,
  rawInput: unknown,
): Promise<WorkOrderRecord> {
  const input = updateTechnicalNotesSchema.parse(rawInput);

  const existing = await findWorkOrderById(workOrderId);
  if (!existing) throw new WorkOrderNotFoundError(workOrderId);

  const updated = await updateWorkOrderTechnicalNotes(workOrderId, input.technicalNotes ?? null);
  if (!updated) throw new WorkOrderNotFoundError(workOrderId);

  await recordAuditLog({
    userId: actorUserId,
    action: "WORK_ORDER_TECHNICAL_NOTES_UPDATED",
    entityType: "work_order",
    entityId: workOrderId,
  });

  return updated;
}

// ============================================================
// Ciclo I — Recebimentos (Financeiro mínimo)
// ============================================================

export interface WorkOrderPaymentsSummary {
  /** Valor devido — lido de WorkOrderClosure.totalAtClosureCents (o
   * fechamento mais recente), nunca duplicado em nenhum campo novo. */
  dueCents: number;
  /** Soma dos lançamentos — calculada sob demanda, nunca armazenada. */
  paidCents: number;
  /** dueCents - paidCents — calculado. */
  remainingCents: number;
  status: "EM_ABERTO" | "PARCIALMENTE_PAGO" | "QUITADO";
  payments: WorkOrderPaymentRecord[];
  /** Ciclo M — estornos já registrados nesta OS (histórico, não afeta o
   * recebimento original, que continua write-once). */
  refunds: WorkOrderPaymentRefundRecord[];
  /** Etapa 3.3 — descontos dados no recebimento (já abatidos de remainingCents). */
  discountCents: number;
  discounts: WorkOrderDiscountRecord[];
}

/**
 * Consolidado de recebimentos de uma OS — só leitura, nada gravado.
 * `dueCents` vem sempre do fechamento mais recente (WorkOrderClosure),
 * nunca de WorkOrder.totalCents diretamente — é a fonte já congelada,
 * desenhada exatamente para este propósito desde o Ciclo 5.
 */
export async function getWorkOrderPaymentsSummaryService(workOrderId: string): Promise<WorkOrderPaymentsSummary | null> {
  const closures = await listClosuresByWorkOrder(workOrderId);
  const latestClosure = closures[0] ?? null;
  if (!latestClosure) return null;

  const [payments, paidCents, refunds, discounts] = await Promise.all([
    listWorkOrderPayments(workOrderId),
    sumWorkOrderPayments(workOrderId),
    listWorkOrderPaymentRefundsByWorkOrder(workOrderId),
    listWorkOrderDiscounts(workOrderId),
  ]);

  const dueCents = latestClosure.totalAtClosureCents;
  const discountCents = discounts.reduce((sum, d) => sum + d.amountCents, 0);
  const remainingCents = dueCents - paidCents - discountCents;
  const status: WorkOrderPaymentsSummary["status"] =
    remainingCents <= 0 ? "QUITADO" : paidCents + discountCents > 0 ? "PARCIALMENTE_PAGO" : "EM_ABERTO";

  return { dueCents, paidCents, remainingCents, status, payments, refunds, discountCents, discounts };
}

/**
 * Registra um recebimento — só permitido com a OS ENTREGUE (DEC-I2) e
 * nunca ultrapassando o saldo restante (DEC-I8). Toda a checagem de
 * saldo acontece dentro da mesma transação com lock, para nunca permitir
 * dois lançamentos simultâneos ultrapassarem o saldo juntos.
 */
export async function registerWorkOrderPaymentService(
  actorUserId: string,
  workOrderId: string,
  rawInput: unknown,
): Promise<WorkOrderPaymentRecord> {
  const input = registerWorkOrderPaymentSchema.parse(rawInput);
  const amountCents = reaisToCents(input.amountReais);
  if (amountCents <= 0) {
    throw new Error("O valor do recebimento precisa ser maior que zero.");
  }

  return withTransaction(async (client) => {
    const workOrder = await lockWorkOrderById(workOrderId, client);
    if (!workOrder) throw new WorkOrderNotFoundError(workOrderId);
    if (workOrder.status !== "ENTREGUE") throw new WorkOrderNotDeliveredError();

    const closures = await listClosuresByWorkOrder(workOrderId, client);
    const latestClosure = closures[0];
    if (!latestClosure) throw new WorkOrderNotDeliveredError();

    const paidSoFar = await sumWorkOrderPayments(workOrderId, client);
    const discountedSoFar = await sumWorkOrderDiscounts(workOrderId, client);
    const remaining = latestClosure.totalAtClosureCents - paidSoFar - discountedSoFar;
    if (amountCents > remaining) {
      throw new WorkOrderPaymentExceedsBalanceError(remaining);
    }

    // Data real do recebimento (opcional): meio-dia de Brasília, sem passar
    // do dia de hoje.
    let receivedAt: Date | null = null;
    if (input.receivedOn) {
      const todayBr = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
      if (input.receivedOn > todayBr) throw new WorkOrderPaymentDateError();
      receivedAt = resolveEventInstant(input.receivedOn);
    }

    const payment = await createWorkOrderPayment(
      {
        workOrderId,
        amountCents,
        method: input.method,
        notes: input.notes ?? null,
        registeredByUserId: actorUserId,
        receivedAt,
      },
      client,
    );

    await recordAuditLog({
      userId: actorUserId,
      action: "WORK_ORDER_PAYMENT_REGISTERED",
      entityType: "work_order",
      entityId: workOrderId,
      metadata: { amountCents, method: input.method, paymentId: payment.id, receivedOn: input.receivedOn ?? null },
    });

    return payment;
  });
}

/**
 * Taxa da maquininha repassada ao cliente e parcelas: só existem em recebimento no CARTÃO. A taxa é um
 * valor à parte (o cliente passa no cartão valor do serviço + taxa); vazio/0 = sem taxa registrada.
 */
function parseCardFeeFields(
  method: string,
  feeRaw: string | number | undefined,
  installmentsRaw: string | number | undefined,
): { cardFeeCents: number | null; installments: number | null } {
  const feeText = feeRaw === undefined ? "" : String(feeRaw).trim();
  const installmentsText = installmentsRaw === undefined ? "" : String(installmentsRaw).trim();
  const cardFeeCents = feeText === "" ? null : reaisToCents(feeText);
  const installments = installmentsText === "" ? null : Number(installmentsText);

  if (cardFeeCents !== null && (!Number.isFinite(cardFeeCents) || cardFeeCents < 0)) {
    throw new Error("O valor da taxa da maquininha é inválido.");
  }
  if (installments !== null && (!Number.isInteger(installments) || installments < 1 || installments > 24)) {
    throw new Error("As parcelas precisam ser um número de 1 a 24.");
  }
  if (method !== "CARTAO" && (cardFeeCents !== null || installments !== null)) {
    throw new Error("Taxa da maquininha e parcelas só valem para recebimento no cartão.");
  }
  // Taxa 0 não é "taxa repassada": deixa como sem taxa (continua valendo a estimativa).
  return { cardFeeCents: cardFeeCents === 0 ? null : cardFeeCents, installments };
}

/**
 * Registra (ou corrige, ou apaga com vazio) a taxa da maquininha e as parcelas de um recebimento no cartão
 * que já existe. Não muda o valor recebido, o saldo da OS nem os estornos.
 */
export async function setWorkOrderPaymentCardFeeService(
  actorUserId: string,
  workOrderId: string,
  paymentId: string,
  rawInput: unknown,
): Promise<WorkOrderPaymentRecord> {
  const input = setPaymentCardFeeSchema.parse(rawInput);
  const payment = await findWorkOrderPaymentById(paymentId);
  if (!payment || payment.workOrderId !== workOrderId) throw new WorkOrderPaymentNotFoundError();
  const { cardFeeCents, installments } = parseCardFeeFields(payment.method, input.cardFeeReais, input.installments);

  const updated = await setWorkOrderPaymentCardFee(paymentId, { cardFeeCents, installments });
  if (!updated) throw new WorkOrderPaymentNotFoundError();

  await recordAuditLog({
    userId: actorUserId,
    action: "WORK_ORDER_PAYMENT_CARD_FEE_SET",
    entityType: "work_order",
    entityId: workOrderId,
    metadata: {
      paymentId,
      before: { cardFeeCents: payment.cardFeeCents, installments: payment.installments },
      after: { cardFeeCents, installments },
    },
  });
  return updated;
}

/**
 * Registra vários recebimentos de uma vez (ex.: parte no Pix, parte no cartão).
 * Cada forma vira um recebimento separado — igual a registrar um por um —, mas
 * tudo numa transação só: se a soma passar do saldo, nada é gravado.
 */
export async function registerWorkOrderPaymentsService(
  actorUserId: string,
  workOrderId: string,
  rawInput: unknown,
): Promise<WorkOrderPaymentRecord[]> {
  const input = registerWorkOrderPaymentsSchema.parse(rawInput);
  const lines = input.payments
    .map((p) => ({
      method: p.method,
      amountCents: reaisToCents(p.amountReais),
      ...parseCardFeeFields(p.method, p.cardFeeReais, p.installments),
    }))
    .filter((p) => p.amountCents !== 0);
  const discountCents = input.discountReais ? reaisToCents(input.discountReais) : 0;
  if ((lines.length === 0 && discountCents <= 0) || lines.some((l) => l.amountCents < 0) || discountCents < 0) {
    throw new Error("O valor do recebimento precisa ser maior que zero.");
  }
  const totalCents = lines.reduce((sum, l) => sum + l.amountCents, 0);

  return withTransaction(async (client) => {
    const workOrder = await lockWorkOrderById(workOrderId, client);
    if (!workOrder) throw new WorkOrderNotFoundError(workOrderId);
    if (workOrder.status !== "ENTREGUE") throw new WorkOrderNotDeliveredError();

    const closures = await listClosuresByWorkOrder(workOrderId, client);
    const latestClosure = closures[0];
    if (!latestClosure) throw new WorkOrderNotDeliveredError();

    const paidSoFar = await sumWorkOrderPayments(workOrderId, client);
    const discountedSoFar = await sumWorkOrderDiscounts(workOrderId, client);
    const remaining = latestClosure.totalAtClosureCents - paidSoFar - discountedSoFar;
    if (totalCents + discountCents > remaining) throw new WorkOrderPaymentExceedsBalanceError(remaining);

    let receivedAt: Date | null = null;
    if (input.receivedOn) {
      const todayBr = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
      if (input.receivedOn > todayBr) throw new WorkOrderPaymentDateError();
      receivedAt = resolveEventInstant(input.receivedOn);
    }

    if (discountCents > 0) {
      const discount = await createWorkOrderDiscount(
        { workOrderId, amountCents: discountCents, reason: input.notes ?? null, createdByUserId: actorUserId },
        client,
      );
      await recordAuditLog({
        userId: actorUserId,
        action: "WORK_ORDER_DISCOUNT_REGISTERED",
        entityType: "work_order",
        entityId: workOrderId,
        metadata: { amountCents: discountCents, discountId: discount.id, reason: input.notes ?? null },
      });
    }

    const created: WorkOrderPaymentRecord[] = [];
    for (const line of lines) {
      const payment = await createWorkOrderPayment(
        {
          workOrderId,
          amountCents: line.amountCents,
          method: line.method,
          notes: input.notes ?? null,
          registeredByUserId: actorUserId,
          receivedAt,
          cardFeeCents: line.cardFeeCents,
          installments: line.installments,
        },
        client,
      );
      created.push(payment);
      await recordAuditLog({
        userId: actorUserId,
        action: "WORK_ORDER_PAYMENT_REGISTERED",
        entityType: "work_order",
        entityId: workOrderId,
        metadata: {
          amountCents: line.amountCents,
          method: line.method,
          paymentId: payment.id,
          receivedOn: input.receivedOn ?? null,
          ...(line.cardFeeCents !== null ? { cardFeeCents: line.cardFeeCents } : {}),
          ...(line.installments !== null ? { installments: line.installments } : {}),
        },
      });
    }
    return created;
  });
}

/**
 * Ciclo M — estorna (parcial ou total) um recebimento já registrado. O
 * recebimento original nunca é editado nem apagado (DEC-I6 mantida) — o
 * estorno é um lançamento novo, separado. A soma dos estornos de um
 * recebimento nunca pode ultrapassar o valor original dele. O saldo/
 * status da OS reabre sozinho na próxima leitura (`sumWorkOrderPayments`
 * já desconta estornos), sem precisar tocar em WorkOrderClosure.
 */
export async function refundWorkOrderPaymentService(
  actorUserId: string,
  workOrderId: string,
  paymentId: string,
  rawInput: unknown,
): Promise<WorkOrderPaymentRefundRecord> {
  const input = refundWorkOrderPaymentSchema.parse(rawInput);
  const refundCents = reaisToCents(input.refundReais);
  if (refundCents <= 0) {
    throw new Error("O valor do estorno precisa ser maior que zero.");
  }

  return withTransaction(async (client) => {
    const workOrder = await lockWorkOrderById(workOrderId, client);
    if (!workOrder) throw new WorkOrderNotFoundError(workOrderId);

    const payment = await findWorkOrderPaymentById(paymentId, client);
    if (!payment || payment.workOrderId !== workOrderId) throw new WorkOrderPaymentNotFoundError();

    const alreadyRefunded = await sumRefundsForPayment(paymentId, client);
    const available = payment.amountCents - alreadyRefunded;
    if (refundCents > available) {
      throw new WorkOrderPaymentRefundExceedsAmountError(available);
    }

    const refund = await createWorkOrderPaymentRefund(
      {
        paymentId,
        workOrderId,
        refundCents,
        reason: input.reason,
        refundedByUserId: actorUserId,
      },
      client,
    );

    await recordAuditLog({
      userId: actorUserId,
      action: "WORK_ORDER_PAYMENT_REFUNDED",
      entityType: "work_order",
      entityId: workOrderId,
      metadata: { paymentId, refundCents, reason: input.reason },
    });

    return refund;
  });
}

// ============================================================
// Ciclo J — Evidências/Fotos
// ============================================================

export async function listWorkOrderEvidencesService(workOrderId: string): Promise<WorkOrderEvidenceRecord[]> {
  return listWorkOrderEvidences(workOrderId);
}

/**
 * Cria uma evidência — sempre permitido, aceite de recepção registrado
 * ou não (DEC-J5). O id é gerado aqui, antes do upload, porque a
 * storageKey do objeto no R2 depende dele (mesma ordem já combinada:
 * gerar id -> montar storageKey -> subir pro R2 -> só então inserir).
 * Upload feito antes do INSERT — se o upload falhar, nenhuma linha é
 * criada (evita registro órfão sem arquivo).
 */
export async function createWorkOrderEvidenceService(
  actorUserId: string,
  workOrderId: string,
  rawInput: unknown,
  fileBuffer: Buffer,
  storageClient: StorageClient = createSupabaseStorageClient(),
): Promise<WorkOrderEvidenceRecord> {
  const input = createWorkOrderEvidenceMetadataSchema.parse(rawInput);

  const workOrder = await findWorkOrderById(workOrderId);
  if (!workOrder) throw new WorkOrderNotFoundError(workOrderId);

  const id = createId();
  const storageKey = buildEvidenceStorageKey(workOrderId, id, input.mimeType);

  await storageClient.putObject({ key: storageKey, body: fileBuffer, contentType: input.mimeType });

  const evidence = await createWorkOrderEvidence({
    id,
    workOrderId,
    type: input.type,
    description: input.description ?? null,
    storageKey,
    mimeType: input.mimeType,
    fileSize: input.fileSize,
    createdByUserId: actorUserId,
  });

  await recordAuditLog({
    userId: actorUserId,
    action: "WORK_ORDER_EVIDENCE_CREATED",
    entityType: "work_order",
    entityId: workOrderId,
    metadata: { evidenceId: evidence.id, type: evidence.type, storageKey },
  });

  return evidence;
}

/**
 * Exclui uma evidência — só permitido enquanto o aceite de recepção
 * ainda não existir (DEC-J5). Mesmo padrão de gate já usado em
 * `updateWorkOrderReceptionInfoService` — reaproveita `receptionAcceptedAt`,
 * nenhuma coluna nova. "Substituir" = chamar esta função + criar de
 * novo — não existe função de update.
 */
export async function deleteWorkOrderEvidenceService(
  actorUserId: string,
  workOrderId: string,
  evidenceId: string,
  storageClient: StorageClient = createSupabaseStorageClient(),
): Promise<void> {
  const workOrder = await findWorkOrderById(workOrderId);
  if (!workOrder) throw new WorkOrderNotFoundError(workOrderId);

  const evidence = await findWorkOrderEvidenceById(evidenceId, workOrderId);
  if (!evidence) throw new WorkOrderEvidenceNotFoundError(evidenceId);
  // O aceite do Termo trava as fotos de entrada e avaria; as das peças trocadas (durante o serviço) seguem livres.
  if (workOrder.receptionAcceptedAt && !REPLACED_PART_EVIDENCE_TYPES.includes(evidence.type)) {
    throw new WorkOrderEvidenceLockedError();
  }

  await storageClient.deleteObject(evidence.storageKey);
  await deleteWorkOrderEvidence(evidenceId);

  await recordAuditLog({
    userId: actorUserId,
    action: "WORK_ORDER_EVIDENCE_DELETED",
    entityType: "work_order",
    entityId: workOrderId,
    metadata: { evidenceId, storageKey: evidence.storageKey },
  });
}

// ============================================================
// Ciclo F — Termo de Recepção
// ============================================================

/** Atualiza a descrição de avarias preexistentes — livre enquanto o
 * aceite de recepção não existir. Depois do aceite, esta função rejeita
 * novas edições (o campo "vivo" deixaria de refletir o que foi
 * congelado no Termo, o que seria confuso, mesmo não sendo tecnicamente
 * perigoso, já que o Termo já aceito nunca relê este campo). */
export async function updateWorkOrderReceptionInfoService(
  actorUserId: string,
  workOrderId: string,
  rawInput: unknown,
): Promise<WorkOrderRecord> {
  const input = updatePreExistingDamagesSchema.parse(rawInput);

  const existing = await findWorkOrderById(workOrderId);
  if (!existing) throw new WorkOrderNotFoundError(workOrderId);
  if (existing.receptionAcceptedAt) throw new WorkOrderReceptionAlreadyAcceptedError();

  const updated = await updatePreExistingDamagesDescription(
    workOrderId,
    input.preExistingDamagesDescription ?? null,
  );
  if (!updated) throw new WorkOrderNotFoundError(workOrderId);

  await recordAuditLog({
    userId: actorUserId,
    action: "WORK_ORDER_RECEPTION_INFO_UPDATED",
    entityType: "work_order",
    entityId: workOrderId,
  });

  return updated;
}

/**
 * Corrige a queixa e o KM de entrada da OS. Livre enquanto o Termo de
 * Recepção não foi aceito; depois do aceite o Termo guarda o que valia na
 * hora e esta correção deixa de ser permitida.
 */
export async function updateWorkOrderCheckInSettingsService(
  actorUserId: string,
  workOrderId: string,
  rawInput: unknown,
): Promise<WorkOrderRecord> {
  const input = updateWorkOrderCheckInSchema.parse(rawInput);

  const existing = await findWorkOrderById(workOrderId);
  if (!existing) throw new WorkOrderNotFoundError(workOrderId);
  if (existing.receptionAcceptedAt) throw new WorkOrderReceptionAlreadyAcceptedError();

  const updated = await updateWorkOrderCheckIn(workOrderId, {
    customerComplaint: input.customerComplaint ?? null,
    mileageAtEntry: input.mileageAtEntry ?? null,
  });
  if (!updated) throw new WorkOrderNotFoundError(workOrderId);

  if (input.mileageAtEntry !== undefined) {
    await bumpVehicleMileageIfHigherService(actorUserId, existing.vehicleId, input.mileageAtEntry);
  }

  await recordAuditLog({
    userId: actorUserId,
    action: "WORK_ORDER_CHECKIN_UPDATED",
    entityType: "work_order",
    entityId: workOrderId,
    metadata: {
      previousComplaint: existing.customerComplaint,
      previousMileage: existing.mileageAtEntry,
      newMileage: updated.mileageAtEntry,
    },
  });

  return updated;
}

/**
 * Registra o aceite de recepção — write-once. Numa única transação:
 * confirma que ainda não existe aceite, congela queixa + avarias (o que
 * estiver gravado em `customerComplaint`/`preExistingDamagesDescription`
 * neste exato instante) e congela o checklist de entrada (CHK-001) desta
 * OS, se uma instância existir — lendo `work_order_checklists`/
 * `work_order_checklist_items` só nesta chamada, nunca mais depois. A
 * instância operacional do checklist continua existindo e funcionando
 * normalmente após o aceite, totalmente desacoplada deste snapshot.
 */
export async function registerWorkOrderReceptionAcceptanceService(
  actorUserId: string,
  workOrderId: string,
  rawInput: unknown,
): Promise<WorkOrderRecord> {
  const input = workOrderReceptionAcceptanceSchema.parse(rawInput);

  return withTransaction(async (client) => {
    const existing = await lockWorkOrderById(workOrderId, client);
    if (!existing) throw new WorkOrderNotFoundError(workOrderId);
    if (existing.receptionAcceptedAt) throw new WorkOrderReceptionAlreadyAcceptedError();

    // O Termo congela o que estiver gravado: sem queixa e KM ele nasceria vazio.
    // Numa OS que já foi entregue (serviço lançado depois de feito) essas informações
    // muitas vezes não existem mais: aceita sem elas, sem obrigar a digitar KM 0.
    const missing: string[] = [];
    if (existing.status !== "ENTREGUE") {
      if (!existing.customerComplaint || existing.customerComplaint.trim() === "") missing.push("a queixa do cliente");
      if (existing.mileageAtEntry === null || existing.mileageAtEntry === undefined) missing.push("o KM do painel");
    }
    if (missing.length > 0) throw new WorkOrderReceptionIncompleteError(missing);

    let checklistSnapshot: ReceptionChecklistSnapshot | null = null;
    const entradaChecklist = await findWorkOrderChecklist({ workOrderId, type: "ENTRADA" }, client);
    if (entradaChecklist) {
      const items = await listWorkOrderChecklistItems(entradaChecklist.id, client);
      checklistSnapshot = {
        code: entradaChecklist.code,
        name: entradaChecklist.name,
        items: items.map((i) => ({
          description: i.description,
          required: i.required,
          sortOrder: i.sortOrder,
          checked: i.checked,
          status: i.status,
          observacao: i.observacao,
        })),
      };
    }

    const updated = await registerWorkOrderReceptionAcceptance(
      workOrderId,
      {
        receptionAcceptedName: input.receptionAcceptedName,
        receptionAcceptedDocument: input.receptionAcceptedDocument ?? null,
        receivedByUserId: actorUserId,
        receptionComplaintSnapshot: existing.customerComplaint,
        receptionDamagesSnapshot: existing.preExistingDamagesDescription,
        receptionChecklistSnapshot: checklistSnapshot,
        receptionAwareness1: input.receptionAwareness1,
        receptionAwareness2: input.receptionAwareness2,
        receptionAwareness3: input.receptionAwareness3,
      },
      client,
    );
    if (!updated) throw new WorkOrderNotFoundError(workOrderId);

    await recordAuditLog({
      userId: actorUserId,
      action: "WORK_ORDER_RECEPTION_ACCEPTED",
      entityType: "work_order",
      entityId: workOrderId,
      metadata: { checklistSnapshotCaptured: checklistSnapshot !== null },
    });

    return updated;
  });
}

// ============================================================
// Leitura
// ============================================================

export interface WorkOrderFullData {
  workOrder: WorkOrderRecord;
  items: WorkOrderItemRecord[];
  closures: Awaited<ReturnType<typeof listClosuresByWorkOrder>>;
}

export async function getWorkOrderService(workOrderId: string): Promise<WorkOrderFullData | null> {
  const workOrder = await findWorkOrderById(workOrderId);
  if (!workOrder) return null;
  const [items, closures] = await Promise.all([
    listWorkOrderItemsByWorkOrder(workOrderId),
    listClosuresByWorkOrder(workOrderId),
  ]);
  return { workOrder, items, closures };
}

export async function searchWorkOrdersService(filters: SearchWorkOrdersFilters) {
  return searchWorkOrders(filters);
}

/** Pátio de hoje: OS que ainda estão na oficina. */
export async function listYardService() {
  return listYardWorkOrders();
}

/** Etapa 4.1 — OS entregues com saldo em aberto (card "A receber" do Início). */
export async function listReceivablesService() {
  return listReceivables();
}

// ============================================================
// Sub-etapa 2 — Adicionais durante a execução
// ============================================================

/** Ciclo B, regra crítica: valida no servidor que todo serviceId
 * referenciado é de um serviço ATIVO — nunca confia que a interface só
 * ofereceu ativos para seleção. */
async function assertServiceIdsActive(serviceIds: (string | undefined)[]): Promise<void> {
  const uniqueIds = [...new Set(serviceIds.filter((id): id is string => Boolean(id)))];
  for (const id of uniqueIds) {
    await assertServiceIsActive(id);
  }
}

/** Mesmo princípio de `assertServiceIdsActive`, para partId. */
async function assertPartIdsActive(partIds: (string | undefined)[]): Promise<void> {
  const uniqueIds = [...new Set(partIds.filter((id): id is string => Boolean(id)))];
  for (const id of uniqueIds) {
    await assertPartIsActive(id);
  }
}

function assertWorkOrderOpenForAdditional(workOrder: WorkOrderRecord) {
  if (workOrder.status === "ENTREGUE" || workOrder.status === "CANCELADA") {
    throw new InvalidWorkOrderItemTransitionError(
      "Esta OS já está fechada/cancelada — não é possível registrar adicionais.",
    );
  }
}

/** Registra um item adicional identificado durante a execução (ponto 3 da
 * rastreabilidade: quem identificou fica em `createdByUserId`). Nasce
 * sempre `clientDecision = PENDENTE` — ainda não autorizado. */
export async function createAdditionalItemService(
  actorUserId: string,
  workOrderId: string,
  rawInput: unknown,
): Promise<WorkOrderItemRecord> {
  const workOrder = await findWorkOrderById(workOrderId);
  if (!workOrder) throw new WorkOrderNotFoundError(workOrderId);
  assertWorkOrderOpenForAdditional(workOrder);

  const input = createAdditionalItemSchema.parse(rawInput);
  if (input.serviceId) await assertServiceIsActive(input.serviceId);
  if (input.partId) await assertPartIsActive(input.partId);
  const unitPriceCents = reaisToCents(input.unitPriceReais);
  const totalCents = lineTotalCents(input.quantity, unitPriceCents);

  const [item] = await insertWorkOrderItems([
    {
      workOrderId,
      type: input.type,
      description: input.description,
      quantity: input.quantity,
      unitPriceCents,
      totalCents,
      origin: "ADICIONAL_DURANTE_EXECUCAO",
      createdByUserId: actorUserId,
      serviceId: input.serviceId ?? null,
      partId: input.partId ?? null,
    },
  ]);

  await recordAuditLog({
    userId: actorUserId,
    action: "WORK_ORDER_ITEM_ADDITIONAL_CREATED",
    entityType: "work_order_item",
    entityId: item.id,
    metadata: { workOrderId, totalCents },
  });

  return item;
}

/** Gera (ou renova) o link público de decisão do adicional — AD-2 (um
 * item = um link), AD-3 (validade fixa de 48h). */
export async function generateAdditionalItemLinkService(
  actorUserId: string,
  workOrderId: string,
  itemId: string,
): Promise<{ item: WorkOrderItemRecord; token: string }> {
  const item = await findWorkOrderItemById(itemId);
  if (!item || item.workOrderId !== workOrderId) throw new WorkOrderItemNotFoundError(itemId);
  if (item.origin !== "ADICIONAL_DURANTE_EXECUCAO") {
    throw new AdditionalItemNotEligibleError("Só itens adicionais têm link de autorização.");
  }
  if (item.clientDecision !== "PENDENTE") {
    throw new AdditionalItemAlreadyDecidedError("Este item já foi decidido — não é possível gerar novo link.");
  }

  const token = generateAdditionalItemAccessToken();
  const expiresAt = computeAdditionalItemExpiresAt();
  const updated = await setWorkOrderItemAccessToken(itemId, token, expiresAt);
  if (!updated) throw new WorkOrderItemNotFoundError(itemId);

  await recordAuditLog({
    userId: actorUserId,
    action: "WORK_ORDER_ITEM_ACCESS_LINK_CREATED",
    entityType: "work_order_item",
    entityId: itemId,
    metadata: { expiresAt },
  });

  return { item: updated, token };
}

/** Autorização direta — presencial ou telefone, sem link (Cenários 3/4). */
export async function authorizeAdditionalItemDirectlyService(
  actorUserId: string,
  workOrderId: string,
  itemId: string,
  rawInput: unknown,
): Promise<WorkOrderItemRecord> {
  const input = authorizeAdditionalItemDirectlySchema.parse(rawInput);

  const item = await findWorkOrderItemById(itemId);
  if (!item || item.workOrderId !== workOrderId) throw new WorkOrderItemNotFoundError(itemId);
  if (item.origin !== "ADICIONAL_DURANTE_EXECUCAO") {
    throw new AdditionalItemNotEligibleError("Só itens adicionais têm autorização de cliente.");
  }
  if (item.clientDecision !== "PENDENTE") {
    throw new AdditionalItemAlreadyDecidedError();
  }

  const updated = await setWorkOrderItemClientDecision(itemId, {
    clientDecision: input.decision,
    clientAuthorizedBy: input.authorizedBy,
    authorizationChannel: input.channel,
    authorizationNotes: input.notes,
  });
  if (!updated) throw new WorkOrderItemNotFoundError(itemId);

  await recordAuditLog({
    userId: actorUserId,
    action: "WORK_ORDER_ITEM_AUTHORIZED",
    entityType: "work_order_item",
    entityId: itemId,
    metadata: { channel: input.channel, decision: input.decision },
  });

  return updated;
}

// ---- Link público (sem auth() — validado só pelo token) ----

export type AdditionalItemAccessResolution =
  | { kind: "not_found" }
  | { kind: "revoked" }
  | { kind: "expired" }
  | { kind: "decided"; item: WorkOrderItemRecord }
  | { kind: "pending"; item: WorkOrderItemRecord };

export async function resolveAdditionalItemAccessTokenService(
  token: string,
): Promise<AdditionalItemAccessResolution> {
  const item = await findWorkOrderItemByAccessToken(token);
  if (!item) return { kind: "not_found" };
  if (item.accessTokenRevokedAt) return { kind: "revoked" };
  if (item.accessTokenExpiresAt && item.accessTokenExpiresAt.getTime() < Date.now() && item.clientDecision === "PENDENTE") {
    return { kind: "expired" };
  }
  if (item.clientDecision !== "PENDENTE") return { kind: "decided", item };
  return { kind: "pending", item };
}

export interface SubmitAdditionalItemDecisionInput {
  decision: "APROVADO" | "RECUSADO";
  approverName: string;
  approverDocument?: string;
  notes?: string;
  ipAddress?: string;
}

/** Submissão da decisão pelo link — mesma trava de linha (`FOR UPDATE`)
 * já usada na decisão do orçamento, protegendo contra clique duplo e
 * submissões simultâneas na mesma decisão. */
export async function submitAdditionalItemDecisionService(
  token: string,
  rawInput: unknown,
): Promise<WorkOrderItemRecord> {
  const input = additionalItemDecisionSchema.parse(rawInput) as SubmitAdditionalItemDecisionInput;

  const link = await findWorkOrderItemByAccessToken(token);
  if (!link) throw new AdditionalItemAccessTokenNotFoundError();
  if (link.accessTokenRevokedAt) throw new AdditionalItemAlreadyDecidedError("Este link não é mais válido.");

  const result = await withTransaction(async (client) => {
    const item = await lockWorkOrderItemById(link.id, client);
    if (!item) throw new AdditionalItemAccessTokenNotFoundError();

    if (item.clientDecision !== "PENDENTE") {
      throw new AdditionalItemAlreadyDecidedError();
    }
    if (item.accessTokenExpiresAt && item.accessTokenExpiresAt.getTime() < Date.now()) {
      throw new AdditionalItemAlreadyDecidedError("Este link expirou.");
    }

    const updated = await setWorkOrderItemClientDecision(
      item.id,
      {
        clientDecision: input.decision,
        clientAuthorizedBy: input.approverName,
        authorizationChannel: "LINK",
        authorizationNotes: input.notes,
        authorizationIpAddress: input.ipAddress,
      },
      client,
    );
    if (!updated) throw new WorkOrderItemNotFoundError(item.id);
    return updated;
  });

  await recordAuditLog({
    action: "WORK_ORDER_ITEM_AUTHORIZED",
    entityType: "work_order_item",
    entityId: result.id,
    metadata: { channel: "LINK", decision: result.clientDecision },
  });

  return result;
}

/** AD-6 — "Ajustar valor/escopo": cancela o item anterior e cria o novo
 * atomicamente, preenchendo `supersedesItemId`. Nunca edita o item antigo
 * em memória (Cenários 5 e 7 da especificação). */
export async function adjustAdditionalItemService(
  actorUserId: string,
  workOrderId: string,
  itemId: string,
  rawInput: unknown,
): Promise<WorkOrderItemRecord> {
  const input = adjustAdditionalItemSchema.parse(rawInput);

  const oldItem = await findWorkOrderItemById(itemId);
  if (!oldItem || oldItem.workOrderId !== workOrderId) throw new WorkOrderItemNotFoundError(itemId);
  if (oldItem.origin !== "ADICIONAL_DURANTE_EXECUCAO") {
    throw new AdditionalItemNotEligibleError("Só itens adicionais podem ser ajustados.");
  }
  if (oldItem.status !== "PLANEJADO") {
    throw new InvalidWorkOrderItemTransitionError(
      "Só é possível ajustar um item que ainda está \"PLANEJADO\".",
    );
  }
  // "Ajustar valor/escopo" é para corrigir um adicional ANTES de o cliente
  // decidir (Cenários 5/7 da especificação — mudar algo já enviado/em
  // negociação). Uma vez que o cliente já aprovou ou recusou, o valor que
  // ele decidiu não pode ser trocado por essa via silenciosa — qualquer
  // correção depois da decisão precisa de um novo registro explícito.
  if (oldItem.clientDecision !== "PENDENTE") {
    throw new AdditionalItemAlreadyDecidedError(
      "Este item já foi decidido pelo cliente — não é possível ajustar por aqui. Cancele e registre um novo adicional se necessário.",
    );
  }

  const unitPriceCents = reaisToCents(input.unitPriceReais);
  const totalCents = lineTotalCents(input.quantity, unitPriceCents);

  const newItem = await withTransaction(async (client) => {
    const locked = await lockWorkOrderItemById(itemId, client);
    if (!locked || locked.status !== "PLANEJADO") {
      throw new InvalidWorkOrderItemTransitionError("Item mudou de estado — recarregue e tente novamente.");
    }
    if (locked.clientDecision !== "PENDENTE") {
      throw new AdditionalItemAlreadyDecidedError(
        "Este item já foi decidido pelo cliente — não é possível ajustar por aqui.",
      );
    }

    // Revoga o link antigo (se existir) — quem acessar depois vê que foi superado.
    if (locked.accessToken) {
      await revokeWorkOrderItemAccessToken(itemId, client);
    }

    await setWorkOrderItemStatus(itemId, "CANCELADO", { cancelReason: input.adjustReason }, client);

    const [created] = await insertWorkOrderItems(
      [
        {
          workOrderId,
          type: locked.type,
          description: input.description,
          quantity: input.quantity,
          unitPriceCents,
          totalCents,
          origin: "ADICIONAL_DURANTE_EXECUCAO",
          createdByUserId: actorUserId,
          supersedesItemId: itemId,
        },
      ],
      client,
    );
    return created;
  });

  await recordAuditLog({
    userId: actorUserId,
    action: "WORK_ORDER_ITEM_SUPERSEDED",
    entityType: "work_order_item",
    entityId: newItem.id,
    metadata: { supersedesItemId: itemId, reason: input.adjustReason },
  });

  return newItem;
}

/**
 * Corrigir um adicional JÁ APROVADO pelo cliente (valor/descrição errados). Cancela o antigo e cria o
 * novo ligado a ele, que já nasce APROVADO (decisão dos donos): quem e como o cliente autorizou é
 * mantido, e o motivo, o valor anterior e a data da aprovação original ficam anotados.
 */
export async function correctApprovedAdditionalItemService(
  actorUserId: string,
  workOrderId: string,
  itemId: string,
  rawInput: unknown,
): Promise<WorkOrderItemRecord> {
  const input = adjustAdditionalItemSchema.parse(rawInput);
  const workOrder = await findWorkOrderById(workOrderId);
  if (!workOrder) throw new WorkOrderNotFoundError(workOrderId);
  assertWorkOrderOpenForAdditional(workOrder);

  const oldItem = await findWorkOrderItemById(itemId);
  if (!oldItem || oldItem.workOrderId !== workOrderId) throw new WorkOrderItemNotFoundError(itemId);
  if (oldItem.origin !== "ADICIONAL_DURANTE_EXECUCAO") {
    throw new AdditionalItemNotEligibleError("Só itens adicionais podem ser corrigidos.");
  }
  if (oldItem.clientDecision !== "APROVADO") {
    throw new AdditionalItemNotEligibleError(
      oldItem.clientDecision === "PENDENTE"
        ? 'Este adicional ainda não foi decidido — use "Ajustar valor/escopo".'
        : "O cliente recusou este adicional — registre um novo adicional se necessário.",
    );
  }
  if (oldItem.status !== "PLANEJADO") {
    throw new InvalidWorkOrderItemTransitionError(
      oldItem.status === "EXECUTADO"
        ? 'Este adicional já foi executado — use "Desfazer execução" antes de corrigir.'
        : "Este adicional já foi cancelado.",
    );
  }

  const unitPriceCents = reaisToCents(input.unitPriceReais);
  const totalCents = lineTotalCents(input.quantity, unitPriceCents);
  const originalDate = oldItem.clientAuthorizedAt
    ? oldItem.clientAuthorizedAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : null;
  const notes =
    `Corrigido pela oficina: ${input.adjustReason}. Valor anterior: ${formatBRL(oldItem.totalCents)}` +
    (oldItem.clientAuthorizedBy
      ? `; aprovação original de ${oldItem.clientAuthorizedBy}${originalDate ? ` em ${originalDate}` : ""}.`
      : ".");

  const newItem = await withTransaction(async (client) => {
    const locked = await lockWorkOrderItemById(itemId, client);
    if (!locked || locked.status !== "PLANEJADO" || locked.clientDecision !== "APROVADO") {
      throw new InvalidWorkOrderItemTransitionError("Item mudou de estado — recarregue e tente novamente.");
    }
    if (locked.accessToken) await revokeWorkOrderItemAccessToken(itemId, client);

    await setWorkOrderItemStatus(itemId, "CANCELADO", { cancelReason: `Corrigido: ${input.adjustReason}` }, client);

    const [created] = await insertWorkOrderItems(
      [
        {
          workOrderId,
          type: locked.type,
          description: input.description,
          quantity: input.quantity,
          unitPriceCents,
          totalCents,
          origin: "ADICIONAL_DURANTE_EXECUCAO",
          createdByUserId: actorUserId,
          supersedesItemId: itemId,
          serviceId: locked.serviceId,
          partId: locked.partId,
          catalogItemType: locked.catalogItemType,
          catalogItemId: locked.catalogItemId,
          customerSupplied: locked.customerSupplied,
        },
      ],
      client,
    );
    const approved = await setWorkOrderItemClientDecision(
      created.id,
      {
        clientDecision: "APROVADO",
        clientAuthorizedBy: locked.clientAuthorizedBy ?? "Cliente",
        authorizationChannel: locked.authorizationChannel ?? "PRESENCIAL",
        authorizationNotes: notes,
      },
      client,
    );
    return approved ?? created;
  });

  await recordAuditLog({
    userId: actorUserId,
    action: "WORK_ORDER_ITEM_SUPERSEDED",
    entityType: "work_order_item",
    entityId: newItem.id,
    metadata: {
      supersedesItemId: itemId,
      reason: input.adjustReason,
      correctedAfterApproval: true,
      previousTotalCents: oldItem.totalCents,
      totalCents,
    },
  });

  return newItem;
}
