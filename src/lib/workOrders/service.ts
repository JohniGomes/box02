import { withTransaction } from "@/lib/db/transaction";
import {
  closeWorkOrder,
  createWorkOrder,
  findWorkOrderById,
  lockWorkOrderById,
  registerWorkOrderReceptionAcceptance,
  searchWorkOrders,
  setWorkOrderStatus,
  updateDiagnosisExplanationNotes,
  updatePreExistingDamagesDescription,
  updateWorkOrderTechnicalNotes,
  type ReceptionChecklistSnapshot,
  type SearchWorkOrdersFilters,
  type WorkOrderRecord,
  type WorkOrderStatus,
} from "@/lib/db/repositories/workOrders";
import {
  findWorkOrderItemByAccessToken,
  findWorkOrderItemById,
  insertWorkOrderItems,
  listWorkOrderItemsByWorkOrder,
  lockWorkOrderItemById,
  revokeWorkOrderItemAccessToken,
  setWorkOrderItemAccessToken,
  setWorkOrderItemClientDecision,
  setWorkOrderItemStatus,
  type WorkOrderItemRecord,
  type WorkOrderItemStatus,
} from "@/lib/db/repositories/workOrderItems";
import { createClosure, listClosuresByWorkOrder } from "@/lib/db/repositories/workOrderClosures";
import {
  createWorkOrderEvidence,
  deleteWorkOrderEvidence,
  findWorkOrderEvidenceById,
  listWorkOrderEvidences,
  type WorkOrderEvidenceRecord,
} from "@/lib/db/repositories/workOrderEvidences";
import { createId } from "@paralleldrive/cuid2";
import { buildEvidenceStorageKey, createR2StorageClient, type StorageClient } from "@/lib/storage/r2";
import {
  createWorkOrderPayment,
  listWorkOrderPayments,
  sumWorkOrderPayments,
  type WorkOrderPaymentRecord,
} from "@/lib/db/repositories/workOrderPayments";
import { findQuoteById } from "@/lib/db/repositories/quotes";
import { findQuoteVersionByNumber } from "@/lib/db/repositories/quoteVersions";
import { listQuoteItemsByVersion } from "@/lib/db/repositories/quoteItems";
import { findCustomerById } from "@/lib/db/repositories/customers";
import { findVehicleById } from "@/lib/db/repositories/vehicles";
import { bumpVehicleMileageIfHigherService } from "@/lib/vehicles/service";
import { assertServiceIsActive } from "@/lib/services/service";
import { recordAuditLog } from "@/lib/db/repositories/auditLog";
import { generateWorkOrderNumber } from "./numbering";
import { computeAdditionalItemExpiresAt, generateAdditionalItemAccessToken } from "./additionalItemToken";
import { computeQuoteTotals, lineTotalCents, reaisToCents } from "@/lib/money";
import {
  additionalItemDecisionSchema,
  adjustAdditionalItemSchema,
  authorizeAdditionalItemDirectlySchema,
  cancelWorkOrderItemSchema,
  cancelWorkOrderSchema,
  createAdditionalItemSchema,
  createWorkOrderEvidenceMetadataSchema,
  createWorkOrderWithoutQuoteSchema,
  registerWorkOrderPaymentSchema,
  updateDiagnosisExplanationSchema,
  updatePreExistingDamagesSchema,
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
  WorkOrderPaymentExceedsBalanceError,
  WorkOrderReceptionAlreadyAcceptedError,
  WorkOrderReceptionNotAcceptedError,
} from "./errors";
import { findWorkOrderChecklist, listWorkOrderChecklistItems } from "@/lib/db/repositories/workOrderChecklists";
import { VehicleCustomerNotFoundError } from "@/lib/vehicles/errors";
import { VehicleNotOwnedByCustomerError } from "@/lib/quotes/errors";

/** Máquina de estados da OS — qualquer par fora daqui é rejeitado. */
const ALLOWED_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  ABERTA: ["EM_DIAGNOSTICO", "EM_EXECUCAO", "CANCELADA"],
  EM_DIAGNOSTICO: ["EM_EXECUCAO", "CANCELADA"],
  EM_EXECUCAO: ["AGUARDANDO_PECA", "TESTE_FINAL", "CANCELADA"],
  AGUARDANDO_PECA: ["EM_EXECUCAO", "CANCELADA"],
  TESTE_FINAL: ["EM_EXECUCAO", "PRONTA", "CANCELADA"],
  PRONTA: ["ENTREGUE", "CANCELADA"],
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

  return withTransaction(async (client) => {
    const workOrder = await createWorkOrder(
      {
        number,
        customerId: quote.customerId,
        vehicleId: quote.vehicleId,
        sourceQuoteVersionId: version.id,
        mileageAtEntry: checkIn.mileageAtEntry,
        customerComplaint: checkIn.customerComplaint,
        diagnosis: checkIn.diagnosis,
        discountType: version.discountType,
        discountValue: version.discountValue,
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
    await bumpVehicleMileageIfHigherService(actorUserId, quote.vehicleId, checkIn.mileageAtEntry);
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
): Promise<CreateWorkOrderResult> {
  const input = createWorkOrderWithoutQuoteSchema.parse(rawInput);
  const { customer, vehicle } = await assertVehicleBelongsToCustomer(input.customerId, input.vehicleId);

  const number = await generateWorkOrderNumber();

  await assertServiceIdsActive(input.items.map((i) => i.serviceId));

  const preparedItems = input.items.map((item) => {
    const unitPriceCents = reaisToCents(item.unitPriceReais);
    return {
      type: item.type,
      description: item.description,
      quantity: item.quantity,
      unitPriceCents,
      totalCents: lineTotalCents(item.quantity, unitPriceCents),
      serviceId: item.serviceId ?? null,
    };
  });

  const result = await withTransaction(async (client) => {
    const workOrder = await createWorkOrder(
      {
        number,
        customerId: input.customerId,
        vehicleId: input.vehicleId,
        sourceQuoteVersionId: null,
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

  await bumpVehicleMileageIfHigherService(actorUserId, input.vehicleId, input.mileageAtEntry);
  return result;
}

// ============================================================
// Transições de status
// ============================================================

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
  if (newStatus === "EM_EXECUCAO" && !existing.receptionAcceptedAt) {
    throw new WorkOrderReceptionNotAcceptedError();
  }

  const extra: Parameters<typeof setWorkOrderStatus>[2] = {};
  if (newStatus === "EM_EXECUCAO" && !existing.startedAt) extra.startedAt = new Date();
  if (newStatus === "TESTE_FINAL") extra.completedAt = new Date();

  const updated = await setWorkOrderStatus(workOrderId, newStatus, extra);
  if (!updated) throw new WorkOrderNotFoundError(workOrderId);

  await recordAuditLog({
    userId: actorUserId,
    action: "WORK_ORDER_STATUS_CHANGED",
    entityType: "work_order",
    entityId: workOrderId,
    metadata: { from: existing.status, to: newStatus },
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

  const updated = await setWorkOrderStatus(workOrderId, "CANCELADA", {
    cancelledAt: new Date(),
    cancelReason: input.reason,
  });
  if (!updated) throw new WorkOrderNotFoundError(workOrderId);

  await recordAuditLog({
    userId: actorUserId,
    action: "WORK_ORDER_CANCELLED",
    entityType: "work_order",
    entityId: workOrderId,
    metadata: { reason: input.reason },
  });

  return updated;
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
  if (status === "CANCELADO") {
    cancelReason = cancelWorkOrderItemSchema.parse(rawInput).reason;
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

    const updated = await setWorkOrderItemStatus(
      itemId,
      status,
      {
        executedAt: status === "EXECUTADO" ? new Date() : undefined,
        executedByUserId: status === "EXECUTADO" ? actorUserId : undefined,
        cancelReason,
      },
      client,
    );
    if (!updated) throw new WorkOrderItemNotFoundError(itemId);

    await recordAuditLog({
      userId: actorUserId,
      action: "WORK_ORDER_ITEM_STATUS_CHANGED",
      entityType: "work_order_item",
      entityId: itemId,
      metadata: { workOrderId, to: status, cancelReason },
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

    assertTransitionAllowed(workOrder.status, "ENTREGUE");

    const items = await listWorkOrderItemsByWorkOrder(workOrderId, client);
    if (items.some((i) => i.status === "PLANEJADO")) {
      throw new WorkOrderHasPendingItemsError();
    }

    // Ciclo E / EX-2 (já aprovada): bloqueia só se existir uma instância
    // de checklist de ENTREGA nesta OS com item obrigatório pendente.
    // Ausência de instância (checklist não configurado ou nunca iniciado
    // nesta OS) NUNCA bloqueia — só o item pendente numa instância que
    // de fato existe.
    const entregaChecklist = await findWorkOrderChecklist({ workOrderId, type: "ENTREGA" }, client);
    if (entregaChecklist) {
      const entregaItems = await listWorkOrderChecklistItems(entregaChecklist.id, client);
      const pending = entregaItems.filter((i) => i.required && !i.checked);
      if (pending.length > 0) {
        throw new WorkOrderDeliveryChecklistPendingError(pending.map((i) => i.description));
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
      metadata: { totalCents: totals.totalCents },
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

  const [payments, paidCents] = await Promise.all([
    listWorkOrderPayments(workOrderId),
    sumWorkOrderPayments(workOrderId),
  ]);

  const dueCents = latestClosure.totalAtClosureCents;
  const remainingCents = dueCents - paidCents;
  const status: WorkOrderPaymentsSummary["status"] =
    remainingCents <= 0 ? "QUITADO" : paidCents > 0 ? "PARCIALMENTE_PAGO" : "EM_ABERTO";

  return { dueCents, paidCents, remainingCents, status, payments };
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
    const remaining = latestClosure.totalAtClosureCents - paidSoFar;
    if (amountCents > remaining) {
      throw new WorkOrderPaymentExceedsBalanceError(remaining);
    }

    const payment = await createWorkOrderPayment(
      {
        workOrderId,
        amountCents,
        method: input.method,
        notes: input.notes ?? null,
        registeredByUserId: actorUserId,
      },
      client,
    );

    await recordAuditLog({
      userId: actorUserId,
      action: "WORK_ORDER_PAYMENT_REGISTERED",
      entityType: "work_order",
      entityId: workOrderId,
      metadata: { amountCents, method: input.method, paymentId: payment.id },
    });

    return payment;
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
  storageClient: StorageClient = createR2StorageClient(),
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
  storageClient: StorageClient = createR2StorageClient(),
): Promise<void> {
  const workOrder = await findWorkOrderById(workOrderId);
  if (!workOrder) throw new WorkOrderNotFoundError(workOrderId);
  if (workOrder.receptionAcceptedAt) throw new WorkOrderEvidenceLockedError();

  const evidence = await findWorkOrderEvidenceById(evidenceId, workOrderId);
  if (!evidence) throw new WorkOrderEvidenceNotFoundError(evidenceId);

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
