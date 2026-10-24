import type { PoolClient } from "pg";
import { withTransaction } from "@/lib/db/transaction";
import {
  createQuote,
  deleteQuote,
  findQuoteById,
  listWorkOrdersByQuote,
  quoteHasWorkOrder,
  listWorkOrderImpactByQuote,
  searchQuotes,
  updateQuoteCheckIn,
  updateQuoteStatusAndVersion,
  type QuoteRecord,
  type SearchQuotesFilters,
} from "@/lib/db/repositories/quotes";
import { isForeignKeyViolation } from "@/lib/db/pgErrors";
import {
  createQuoteVersion,
  findQuoteVersionById,
  findQuoteVersionByNumber,
  lockQuoteVersionById,
  listQuoteVersionsByQuote,
  setQuoteVersionStatus,
  updateQuoteVersionContent,
  type QuoteVersionRecord,
} from "@/lib/db/repositories/quoteVersions";
import {
  deleteQuoteItemsByVersion,
  insertQuoteItems,
  listQuoteItemsByVersion,
  setQuoteItemDecision,
  type QuoteItemRecord,
} from "@/lib/db/repositories/quoteItems";
import {
  createQuoteAccessLink,
  findActiveLinkForVersion,
  findQuoteAccessLinkByToken,
  revokeActiveLinksForVersion,
} from "@/lib/db/repositories/quoteAccessLinks";
import {
  createQuoteApproval,
  findQuoteApprovalByVersion,
  type QuoteApprovalRecord,
} from "@/lib/db/repositories/quoteApprovals";
import { findVehicleById, type VehicleRecord } from "@/lib/db/repositories/vehicles";
import { findCustomerById, type CustomerRecord } from "@/lib/db/repositories/customers";
import { listAuditLogsForEntity, recordAuditLog } from "@/lib/db/repositories/auditLog";
import { generateQuoteNumber } from "./numbering";
import { generateQuoteAccessToken } from "./token";
import { assertServiceIsActive } from "@/lib/services/service";
import { assertPartIsActive } from "@/lib/inventory/service";
import { getQuoteDefaultValidityDays } from "@/lib/settings/service";
import { computeQuoteTotals, lineTotalCents, reaisToCents } from "@/lib/money";
import { quoteCheckInSchema, quoteInputSchema, type QuoteInput } from "@/lib/validation/quote";
import { quoteDecisionInputSchema, type QuoteDecisionInput } from "@/lib/validation/quoteApproval";
import {
  InvalidQuoteTransitionError,
  QuoteAccessTokenNotFoundError,
  QuoteAlreadyDecidedError,
  QuoteItemsIncompleteDecisionError,
  QuoteNotDeletableError,
  QuoteNotFoundError,
  QuoteVersionNotEditableError,
  QuoteVersionNotFoundError,
  VehicleNotOwnedByCustomerError,
} from "./errors";

export interface QuoteWithCurrentVersion {
  quote: QuoteRecord;
  version: QuoteVersionRecord;
  items: QuoteItemRecord[];
  allVersions: QuoteVersionRecord[];
}

/**
 * Ciclo C1: exclui itens INFORMATIVO antes de alimentar `computeQuoteTotals`
 * — é este o único ponto que decide "o que entra no total do orçamento".
 * `computeQuoteTotals` em si (money/index.ts) permanece genérico e
 * intocado, exatamente como o comentário lá já pede ("nunca reimplementar
 * esse cálculo em outro módulo") — a exclusão acontece aqui, na camada de
 * orçamento, não dentro da função de cálculo compartilhada.
 */
function itemsForTotals(
  items: { type: string; totalCents: number; category: string }[],
) {
  return items.filter((i) => i.category !== "INFORMATIVO") as {
    type: "SERVICO" | "PECA" | "MAO_DE_OBRA";
    totalCents: number;
  }[];
}

function preparedItems(input: QuoteInput["items"]) {
  return input.map((item) => {
    // Peça do cliente nunca é cobrada: o valor é zerado aqui, no servidor.
    const unitPriceCents = item.customerSupplied ? 0 : reaisToCents(item.unitPriceReais);
    const totalCents = lineTotalCents(item.quantity, unitPriceCents);
    return { ...item, unitPriceCents, totalCents };
  });
}

/** Ciclo B, regra crítica: valida no servidor que todo serviceId
 * referenciado por algum item é de um serviço ATIVO — nunca confia que a
 * interface só ofereceu ativos para seleção. Ids `undefined` (item
 * personalizado) são ignorados. */
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

async function resolveValidUntil(validUntilIso?: string): Promise<Date> {
  if (validUntilIso) {
    const d = new Date(validUntilIso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const days = await getQuoteDefaultValidityDays();
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Se uma versão está ENVIADO e a validade já passou, reconhece isso agora
 * (K5 — sob demanda, sem job agendado) e grava EXPIRADO no banco antes de
 * devolver os dados. Nunca apaga nada, só atualiza o status.
 */
async function reconcileExpiration(version: QuoteVersionRecord): Promise<QuoteVersionRecord> {
  if (version.status !== "ENVIADO") return version;
  if (version.validUntil.getTime() >= Date.now()) return version;

  const updated = await setQuoteVersionStatus(version.id, "EXPIRADO");
  await updateQuoteStatusAndVersion(version.quoteId, "EXPIRADO", version.versionNumber);
  await recordAuditLog({
    action: "QUOTE_EXPIRED",
    entityType: "quote_version",
    entityId: version.id,
  });
  return updated ?? version;
}

export async function createQuoteService(
  actorUserId: string,
  rawInput: unknown,
): Promise<QuoteWithCurrentVersion> {
  const input = quoteInputSchema.parse(rawInput);

  const vehicle = await findVehicleById(input.vehicleId);
  if (!vehicle || vehicle.customerId !== input.customerId) {
    throw new VehicleNotOwnedByCustomerError();
  }

  const items = preparedItems(input.items);
  await assertServiceIdsActive(items.map((i) => i.serviceId));
  await assertPartIdsActive(items.map((i) => i.partId));
  const totals = computeQuoteTotals({
    items: itemsForTotals(items),
    discountType: input.discount?.type ?? null,
    discountValue: input.discount?.value != null ? reaisOrPercentToInternal(input.discount) : null,
    surchargeType: input.surcharge?.type ?? null,
    surchargeValue: input.surcharge?.value != null ? reaisOrPercentToInternal(input.surcharge) : null,
  });

  const validUntil = await resolveValidUntil(input.validUntil);
  const number = await generateQuoteNumber();

  const result = await withTransaction(async (client) => {
    const quote = await createQuote(
      {
        number,
        customerId: input.customerId,
        vehicleId: input.vehicleId,
        createdByUserId: actorUserId,
        customerComplaint: input.customerComplaint ?? null,
        mileageAtEntry: input.mileageAtEntry ?? null,
      },
      client,
    );
    const version = await createQuoteVersion(
      {
        quoteId: quote.id,
        versionNumber: 1,
        validUntil,
        internalNotes: input.internalNotes ?? null,
        customerMessage: input.customerMessage ?? null,
        ...totals,
        discountType: input.discount?.type ?? null,
        discountValue: input.discount?.value != null ? reaisOrPercentToInternal(input.discount) : null,
        discountReason: input.discount?.value != null ? (input.discount?.reason ?? null) : null,
        surchargeType: input.surcharge?.type ?? null,
        surchargeValue: input.surcharge?.value != null ? reaisOrPercentToInternal(input.surcharge) : null,
        createdByUserId: actorUserId,
      },
      client,
    );
    const insertedItems = await insertQuoteItems(
      items.map((item) => ({
        quoteVersionId: version.id,
        type: item.type,
        description: item.description,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        totalCents: item.totalCents,
        serviceId: item.serviceId ?? null,
        partId: item.partId ?? null,
        category: item.category,
        notes: item.notes ?? null,
        customerSupplied: item.customerSupplied ?? false,
      })),
      client,
    );
    return { quote, version, items: insertedItems };
  });

  await recordAuditLog({
    userId: actorUserId,
    action: "QUOTE_CREATED",
    entityType: "quote",
    entityId: result.quote.id,
    metadata: { number: result.quote.number },
  });
  await recordAuditLog({
    userId: actorUserId,
    action: "QUOTE_VERSION_CREATED",
    entityType: "quote_version",
    entityId: result.version.id,
    metadata: { versionNumber: 1 },
  });

  return { ...result, allVersions: [result.version] };
}

/**
 * Corrige a queixa e o KM do orçamento. Vale para todas as versões e é
 * copiado para a OS na hora de criá-la; depois que a OS existe, a correção é
 * feita na própria OS (até o aceite do Termo).
 */
export async function updateQuoteCheckInService(
  actorUserId: string,
  quoteId: string,
  rawInput: unknown,
): Promise<QuoteRecord> {
  const input = quoteCheckInSchema.parse(rawInput);
  const quote = await findQuoteById(quoteId);
  if (!quote) throw new QuoteNotFoundError(quoteId);

  const updated = await updateQuoteCheckIn(quoteId, {
    customerComplaint: input.customerComplaint ?? null,
    mileageAtEntry: input.mileageAtEntry ?? null,
  });
  if (!updated) throw new QuoteNotFoundError(quoteId);

  await recordAuditLog({
    userId: actorUserId,
    action: "QUOTE_CHECKIN_UPDATED",
    entityType: "quote",
    entityId: quoteId,
    metadata: { previousComplaint: quote.customerComplaint, previousMileage: quote.mileageAtEntry },
  });
  return updated;
}

export async function updateQuoteVersionService(
  actorUserId: string,
  quoteId: string,
  rawInput: unknown,
): Promise<QuoteWithCurrentVersion> {
  const quote = await findQuoteById(quoteId);
  if (!quote) throw new QuoteNotFoundError(quoteId);

  const currentVersion = await findQuoteVersionByNumber(quoteId, quote.currentVersionNumber);
  if (!currentVersion) throw new QuoteVersionNotFoundError(quoteId);
  if (currentVersion.status !== "RASCUNHO") throw new QuoteVersionNotEditableError();

  const partialSchema = quoteInputSchema.omit({ customerId: true, vehicleId: true });
  const input = partialSchema.parse(rawInput);

  const items = preparedItems(input.items);
  await assertServiceIdsActive(items.map((i) => i.serviceId));
  await assertPartIdsActive(items.map((i) => i.partId));
  const totals = computeQuoteTotals({
    items: itemsForTotals(items),
    discountType: input.discount?.type ?? null,
    discountValue: input.discount?.value != null ? reaisOrPercentToInternal(input.discount) : null,
    surchargeType: input.surcharge?.type ?? null,
    surchargeValue: input.surcharge?.value != null ? reaisOrPercentToInternal(input.surcharge) : null,
  });
  const validUntil = await resolveValidUntil(input.validUntil);

  const result = await withTransaction(async (client) => {
    await deleteQuoteItemsByVersion(currentVersion.id, client);
    const insertedItems = await insertQuoteItems(
      items.map((item) => ({
        quoteVersionId: currentVersion.id,
        type: item.type,
        description: item.description,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        totalCents: item.totalCents,
        serviceId: item.serviceId ?? null,
        partId: item.partId ?? null,
        category: item.category,
        notes: item.notes ?? null,
        customerSupplied: item.customerSupplied ?? false,
      })),
      client,
    );
    const updatedVersion = await updateQuoteVersionContent(
      currentVersion.id,
      {
        validUntil,
        internalNotes: input.internalNotes ?? null,
        customerMessage: input.customerMessage ?? null,
        ...totals,
        discountType: input.discount?.type ?? null,
        discountValue: input.discount?.value != null ? reaisOrPercentToInternal(input.discount) : null,
        discountReason: input.discount?.value != null ? (input.discount?.reason ?? null) : null,
        surchargeType: input.surcharge?.type ?? null,
        surchargeValue: input.surcharge?.value != null ? reaisOrPercentToInternal(input.surcharge) : null,
      },
      client,
    );
    return { version: updatedVersion as QuoteVersionRecord, items: insertedItems };
  });

  await recordAuditLog({
    userId: actorUserId,
    action: "QUOTE_VERSION_UPDATED",
    entityType: "quote_version",
    entityId: currentVersion.id,
  });

  const allVersions = await listQuoteVersionsByQuote(quoteId);
  return { quote, version: result.version, items: result.items, allVersions };
}

export async function sendQuoteVersionService(
  actorUserId: string,
  quoteId: string,
): Promise<QuoteVersionRecord> {
  const quote = await findQuoteById(quoteId);
  if (!quote) throw new QuoteNotFoundError(quoteId);

  const currentVersion = await findQuoteVersionByNumber(quoteId, quote.currentVersionNumber);
  if (!currentVersion) throw new QuoteVersionNotFoundError(quoteId);
  if (currentVersion.status !== "RASCUNHO") {
    throw new InvalidQuoteTransitionError("Só é possível enviar um orçamento em rascunho.");
  }

  const items = await listQuoteItemsByVersion(currentVersion.id);
  if (items.length === 0) {
    throw new InvalidQuoteTransitionError("Adicione pelo menos um item antes de enviar.");
  }

  const updated = await setQuoteVersionStatus(currentVersion.id, "ENVIADO", { sentAt: new Date() });
  await updateQuoteStatusAndVersion(quoteId, "ENVIADO", quote.currentVersionNumber);

  // O link de acesso público herda a validade da própria versão (D2 + K4).
  const token = generateQuoteAccessToken();
  await createQuoteAccessLink({
    quoteVersionId: currentVersion.id,
    token,
    expiresAt: currentVersion.validUntil,
  });

  await recordAuditLog({
    userId: actorUserId,
    action: "QUOTE_SENT",
    entityType: "quote_version",
    entityId: currentVersion.id,
  });

  return updated as QuoteVersionRecord;
}

export async function createNewQuoteVersionService(
  actorUserId: string,
  quoteId: string,
): Promise<QuoteWithCurrentVersion> {
  const quote = await findQuoteById(quoteId);
  if (!quote) throw new QuoteNotFoundError(quoteId);

  const currentVersion = await findQuoteVersionByNumber(quoteId, quote.currentVersionNumber);
  if (!currentVersion) throw new QuoteVersionNotFoundError(quoteId);
  if (currentVersion.status === "RASCUNHO") {
    throw new InvalidQuoteTransitionError(
      "Esta versão ainda está em rascunho — edite diretamente em vez de criar uma nova versão.",
    );
  }

  const previousItems = await listQuoteItemsByVersion(currentVersion.id);
  const newVersionNumber = quote.currentVersionNumber + 1;
  const validUntil = await resolveValidUntil();

  const result = await withTransaction(async (client) => {
    const newVersion = await createQuoteVersion(
      {
        quoteId,
        versionNumber: newVersionNumber,
        validUntil,
        internalNotes: currentVersion.internalNotes,
        customerMessage: currentVersion.customerMessage,
        subtotalServicesCents: currentVersion.subtotalServicesCents,
        subtotalPartsCents: currentVersion.subtotalPartsCents,
        subtotalLaborCents: currentVersion.subtotalLaborCents,
        discountType: currentVersion.discountType,
        discountValue: currentVersion.discountValue,
        discountTotalCents: currentVersion.discountTotalCents,
        discountReason: currentVersion.discountReason,
        surchargeType: currentVersion.surchargeType,
        surchargeValue: currentVersion.surchargeValue,
        surchargeTotalCents: currentVersion.surchargeTotalCents,
        totalCents: currentVersion.totalCents,
        createdByUserId: actorUserId,
      },
      client,
    );
    const insertedItems = await insertQuoteItems(
      previousItems.map((item) => ({
        quoteVersionId: newVersion.id,
        type: item.type,
        description: item.description,
        quantity: Number(item.quantity),
        unitPriceCents: item.unitPriceCents,
        totalCents: item.totalCents,
        catalogItemType: item.catalogItemType,
        catalogItemId: item.catalogItemId,
        serviceId: item.serviceId,
        partId: item.partId,
        category: item.category,
        notes: item.notes,
        customerSupplied: item.customerSupplied,
      })),
      client,
    );
    return { version: newVersion, items: insertedItems };
  });

  await updateQuoteStatusAndVersion(quoteId, "RASCUNHO", newVersionNumber);

  // A versão anterior não pode mais ser decidida por um link já enviado —
  // qualquer acesso a esse link agora deve ver "existe uma versão mais
  // nova", não a proposta desatualizada.
  await revokeActiveLinksForVersion(currentVersion.id);
  await recordAuditLog({
    userId: actorUserId,
    action: "QUOTE_LINK_REVOKED",
    entityType: "quote_version",
    entityId: currentVersion.id,
    metadata: { reason: "nova_versao_criada" },
  });

  await recordAuditLog({
    userId: actorUserId,
    action: "QUOTE_VERSION_CREATED",
    entityType: "quote_version",
    entityId: result.version.id,
    metadata: { versionNumber: newVersionNumber, previousVersionNumber: currentVersion.versionNumber },
  });

  const allVersions = await listQuoteVersionsByQuote(quoteId);
  return { quote: { ...quote, status: "RASCUNHO", currentVersionNumber: newVersionNumber }, version: result.version, items: result.items, allVersions };
}

export async function cancelQuoteVersionService(
  actorUserId: string,
  quoteId: string,
  input: { reason?: string } = {},
): Promise<QuoteVersionRecord> {
  const quote = await findQuoteById(quoteId);
  if (!quote) throw new QuoteNotFoundError(quoteId);

  const currentVersion = await findQuoteVersionByNumber(quoteId, quote.currentVersionNumber);
  if (!currentVersion) throw new QuoteVersionNotFoundError(quoteId);
  const wasApproved = currentVersion.status === "APROVADO" || currentVersion.status === "APROVADO_PARCIAL";
  if (currentVersion.status !== "RASCUNHO" && currentVersion.status !== "ENVIADO" && !wasApproved) {
    throw new InvalidQuoteTransitionError(
      "Só é possível cancelar um orçamento em rascunho, aguardando decisão do cliente ou aprovado.",
    );
  }
  const reason = input.reason?.trim() ?? "";
  if (wasApproved && reason.length < 3) {
    throw new InvalidQuoteTransitionError("Informe o motivo do cancelamento.");
  }

  const updated = await setQuoteVersionStatus(currentVersion.id, "CANCELADO");
  await updateQuoteStatusAndVersion(quoteId, "CANCELADO", quote.currentVersionNumber);

  await recordAuditLog({
    userId: actorUserId,
    action: "QUOTE_CANCELLED",
    entityType: "quote_version",
    entityId: currentVersion.id,
    metadata: { reason: reason || null, previousStatus: currentVersion.status },
  });

  return updated as QuoteVersionRecord;
}

/** Versão anterior que ainda vale: a mais recente, antes da vigente, que não
 * foi cancelada. É para onde se "volta" ao descartar uma versão nova. */
function findRestorableVersion(
  allVersions: QuoteVersionRecord[],
  currentVersionNumber: number,
): QuoteVersionRecord | null {
  return (
    allVersions
      .filter((v) => v.versionNumber < currentVersionNumber && v.status !== "CANCELADO")
      .sort((a, b) => b.versionNumber - a.versionNumber)[0] ?? null
  );
}

export function getRestorableVersion(allVersions: QuoteVersionRecord[], currentVersionNumber: number) {
  return findRestorableVersion(allVersions, currentVersionNumber);
}

/** Torna `target` a versão vigente do orçamento. Se ela estava aguardando o
 * cliente (ENVIADO) mas o link foi revogado quando a versão nova foi criada,
 * gera um link novo para ela poder ser decidida de novo. */
async function makeVersionCurrent(
  quoteId: string,
  target: QuoteVersionRecord,
  client: PoolClient,
): Promise<void> {
  await updateQuoteStatusAndVersion(quoteId, target.status, target.versionNumber, client);
  if (target.status === "ENVIADO") {
    const active = await findActiveLinkForVersion(target.id, client);
    if (!active) {
      await createQuoteAccessLink(
        { quoteVersionId: target.id, token: generateQuoteAccessToken(), expiresAt: target.validUntil },
        client,
      );
    }
  }
}

/**
 * Descarta a versão vigente (rascunho ou enviada) e VOLTA para a versão
 * anterior, que continua exatamente como estava (ex.: aprovada). Diferente
 * de "cancelar orçamento", que encerra o orçamento inteiro.
 */
export async function discardQuoteVersionService(
  actorUserId: string,
  quoteId: string,
): Promise<QuoteVersionRecord> {
  const quote = await findQuoteById(quoteId);
  if (!quote) throw new QuoteNotFoundError(quoteId);

  const current = await findQuoteVersionByNumber(quoteId, quote.currentVersionNumber);
  if (!current) throw new QuoteVersionNotFoundError(quoteId);
  if (current.status !== "RASCUNHO" && current.status !== "ENVIADO") {
    throw new InvalidQuoteTransitionError("Só dá para descartar uma versão em rascunho ou aguardando o cliente.");
  }

  const previous = findRestorableVersion(await listQuoteVersionsByQuote(quoteId), current.versionNumber);
  if (!previous) {
    throw new InvalidQuoteTransitionError("Não há versão anterior para voltar. Use \"Cancelar orçamento\".");
  }

  await withTransaction(async (client) => {
    await setQuoteVersionStatus(current.id, "CANCELADO", undefined, client);
    await revokeActiveLinksForVersion(current.id, client);
    await makeVersionCurrent(quoteId, previous, client);
  });

  await recordAuditLog({
    userId: actorUserId,
    action: "QUOTE_VERSION_DISCARDED",
    entityType: "quote_version",
    entityId: current.id,
    metadata: { discardedVersion: current.versionNumber, backToVersion: previous.versionNumber },
  });

  return previous;
}

/**
 * Para um orçamento cuja versão vigente foi CANCELADA (por engano ou não):
 * volta para a versão anterior que ainda vale, sem apagar nada.
 */
export async function restorePreviousQuoteVersionService(
  actorUserId: string,
  quoteId: string,
): Promise<QuoteVersionRecord> {
  const quote = await findQuoteById(quoteId);
  if (!quote) throw new QuoteNotFoundError(quoteId);

  const current = await findQuoteVersionByNumber(quoteId, quote.currentVersionNumber);
  if (!current) throw new QuoteVersionNotFoundError(quoteId);
  if (current.status !== "CANCELADO") {
    throw new InvalidQuoteTransitionError("A versão atual não está cancelada — não há o que restaurar.");
  }

  const previous = findRestorableVersion(await listQuoteVersionsByQuote(quoteId), current.versionNumber);
  if (!previous) throw new InvalidQuoteTransitionError("Não há versão anterior para voltar.");

  await withTransaction(async (client) => {
    await makeVersionCurrent(quoteId, previous, client);
  });

  await recordAuditLog({
    userId: actorUserId,
    action: "QUOTE_VERSION_RESTORED",
    entityType: "quote_version",
    entityId: previous.id,
    metadata: { fromVersion: current.versionNumber, backToVersion: previous.versionNumber },
  });

  return previous;
}

/** OS ligadas ao orçamento com o que já foi pago/executado (aviso antes de cancelar). */
export async function getQuoteCancellationImpactService(quoteId: string) {
  return listWorkOrderImpactByQuote(quoteId);
}

/** Motivo e autor do cancelamento da versão, se houver. */
export async function getQuoteCancellationInfoService(versionId: string) {
  const [last] = await listAuditLogsForEntity("quote_version", versionId, ["QUOTE_CANCELLED"]);
  if (!last) return null;
  return {
    at: last.createdAt,
    by: last.userName,
    reason: typeof last.metadata?.reason === "string" ? last.metadata.reason : null,
  };
}

export async function listQuoteWorkOrdersService(quoteId: string) {
  return listWorkOrdersByQuote(quoteId);
}

/** Link ativo (não revogado) da versão, se existir — usado na ficha do
 * orçamento para a oficina copiar/reenviar o link ao cliente. */
export async function getActiveQuoteLinkService(quoteVersionId: string) {
  return findActiveLinkForVersion(quoteVersionId);
}

export async function getQuoteApprovalService(quoteVersionId: string) {
  return findQuoteApprovalByVersion(quoteVersionId);
}

export async function getQuoteService(quoteId: string): Promise<QuoteWithCurrentVersion | null> {
  const quote = await findQuoteById(quoteId);
  if (!quote) return null;

  let currentVersion = await findQuoteVersionByNumber(quoteId, quote.currentVersionNumber);
  if (!currentVersion) return null;

  currentVersion = await reconcileExpiration(currentVersion);
  const items = await listQuoteItemsByVersion(currentVersion.id);
  const allVersions = await listQuoteVersionsByQuote(quoteId);

  const refreshedQuote = currentVersion.status !== quote.status ? { ...quote, status: currentVersion.status } : quote;

  return { quote: refreshedQuote, version: currentVersion, items, allVersions };
}

export async function searchQuotesService(filters: SearchQuotesFilters) {
  const result = await searchQuotes(filters);

  for (const item of result.items) {
    if (item.status === "ENVIADO") {
      const version = await findQuoteVersionByNumber(item.id, item.currentVersionNumber);
      if (version) {
        const reconciled = await reconcileExpiration(version);
        if (reconciled.status !== item.status) {
          item.status = reconciled.status;
        }
      }
    }
  }

  return result;
}

/**
 * Converte o valor do desconto/acréscimo já em unidade interna: para
 * PERCENTUAL, percentual × 100 (10,5% -> 1050); para FIXO, reais -> centavos.
 */
function reaisOrPercentToInternal(adj: { type?: "PERCENTUAL" | "FIXO" | null; value?: number | null }) {
  if (adj.value == null) return null;
  if (adj.type === "PERCENTUAL") return Math.round(adj.value * 100);
  return reaisToCents(adj.value);
}

// ============================================================
// SUB-ETAPA 2 — Link público e aprovação
// ============================================================

export interface QuoteAccessContext {
  quote: QuoteRecord;
  version: QuoteVersionRecord;
  items: QuoteItemRecord[];
  customer: CustomerRecord;
  vehicle: VehicleRecord;
}

export type QuoteAccessResolution =
  | { kind: "not_found" }
  | { kind: "revoked" }
  | { kind: "expired"; validUntil: Date }
  | { kind: "cancelled" }
  | { kind: "decided"; context: QuoteAccessContext; approval: QuoteApprovalRecord }
  | { kind: "pending"; context: QuoteAccessContext };

/**
 * Resolve um token de acesso público — nunca lança erro para estados
 * esperados (expirado, revogado, já decidido); a página pública decide o
 * que mostrar a partir do `kind`. Só retorna dados do ORÇAMENTO
 * CORRESPONDENTE AO TOKEN — não há caminho para acessar outro orçamento
 * a partir daqui (a segurança é estrutural, não uma checagem extra).
 */
export async function resolveQuoteAccessTokenService(token: string): Promise<QuoteAccessResolution> {
  const link = await findQuoteAccessLinkByToken(token);
  if (!link) return { kind: "not_found" };
  if (link.revokedAt) return { kind: "revoked" };

  let version = await findQuoteVersionById(link.quoteVersionId);
  if (!version) return { kind: "not_found" };

  version = await reconcileExpiration(version);

  const quote = await findQuoteById(version.quoteId);
  if (!quote) return { kind: "not_found" };

  if (version.status === "EXPIRADO") return { kind: "expired", validUntil: version.validUntil };
  if (version.status === "CANCELADO") return { kind: "cancelled" };

  const [items, customer, vehicle] = await Promise.all([
    listQuoteItemsByVersion(version.id),
    findCustomerById(quote.customerId),
    findVehicleById(quote.vehicleId),
  ]);
  if (!customer || !vehicle) return { kind: "not_found" };

  const context: QuoteAccessContext = { quote, version, items, customer, vehicle };

  if (version.status === "ENVIADO") return { kind: "pending", context };

  // APROVADO / APROVADO_PARCIAL / RECUSADO
  const approval = await findQuoteApprovalByVersion(version.id);
  if (!approval) return { kind: "pending", context }; // estado inconsistente defensivo — trata como pendente
  return { kind: "decided", context, approval };
}

export interface SubmitQuoteDecisionInput {
  itemDecisions: { itemId: string; decision: "APROVADO" | "RECUSADO" }[];
  approverName: string;
  approverDocument?: string;
  reason?: string;
  notes?: string;
  ipAddress?: string;
}

/**
 * Submete a decisão do cliente para um token. Protegida contra:
 * - token inexistente/revogado/expirado (mesmas checagens de resolução);
 * - item pendente (todo item da versão precisa vir com decisão — K7);
 * - segunda submissão (versão trava com FOR UPDATE; se já não estiver
 *   ENVIADO quando a trava é obtida, rejeita sem aplicar nada de novo);
 * - duas submissões simultâneas (a trava de linha serializa: a segunda
 *   só prossegue depois que a primeira commita, e nesse ponto já vê o
 *   status alterado — mesma proteção do item acima).
 */
export async function submitPublicQuoteDecisionService(
  token: string,
  rawInput: unknown,
): Promise<QuoteVersionRecord> {
  const input = quoteDecisionInputSchema.parse(rawInput) as QuoteDecisionInput;

  const link = await findQuoteAccessLinkByToken(token);
  if (!link) throw new QuoteAccessTokenNotFoundError();
  if (link.revokedAt) throw new QuoteAlreadyDecidedError("Este link não é mais válido.");

  const result = await withTransaction(async (client) => {
    const version = await lockQuoteVersionById(link.quoteVersionId, client);
    if (!version) throw new QuoteAccessTokenNotFoundError();

    if (version.status !== "ENVIADO") {
      throw new QuoteAlreadyDecidedError(
        "Este orçamento já não está mais aguardando decisão (pode já ter sido decidido, expirado ou cancelado).",
      );
    }

    if (version.validUntil.getTime() < Date.now()) {
      await setQuoteVersionStatus(version.id, "EXPIRADO", undefined, client);
      await updateQuoteStatusAndVersion(version.quoteId, "EXPIRADO", version.versionNumber, client);
      await recordAuditLog({
        action: "QUOTE_EXPIRED",
        entityType: "quote_version",
        entityId: version.id,
      });
      throw new QuoteAlreadyDecidedError("Este orçamento expirou.");
    }

    const items = await listQuoteItemsByVersion(version.id, client);
    const itemIds = new Set(items.map((i) => i.id));
    const decisionByItemId = new Map(input.itemDecisions.map((d) => [d.itemId, d.decision]));

    // Segurança: toda decisão precisa se referir a um item que realmente
    // pertence a ESTA versão — nunca a itens de outro orçamento.
    for (const d of input.itemDecisions) {
      if (!itemIds.has(d.itemId)) {
        throw new QuoteItemsIncompleteDecisionError("Item não pertence a este orçamento.");
      }
    }

    // Ciclo C1: INFORMATIVO nunca é decidível — bloqueado aqui, no
    // servidor, mesmo que alguém tente submeter uma decisão para ele
    // chamando o serviço diretamente (não só escondendo o botão na UI).
    const itemById = new Map(items.map((i) => [i.id, i]));
    for (const d of input.itemDecisions) {
      if (itemById.get(d.itemId)?.category === "INFORMATIVO") {
        throw new QuoteItemsIncompleteDecisionError(
          "Item informativo não é decidível — não exige aprovação nem recusa do cliente.",
        );
      }
    }

    // Só NECESSARIO/RECOMENDADO participam do fluxo de decisão —
    // INFORMATIVO nunca é exigido, nunca é aplicado, nunca conta para o
    // resultado agregado (APROVADO/APROVADO_PARCIAL/RECUSADO).
    const decidableItems = items.filter((item) => item.category !== "INFORMATIVO");

    // Todo item DECIDÍVEL da versão precisa ter recebido uma decisão.
    if (decidableItems.some((item) => !decisionByItemId.has(item.id))) {
      throw new QuoteItemsIncompleteDecisionError(
        "Todos os itens precisam de uma decisão (aprovado ou recusado) antes de confirmar.",
      );
    }

    for (const item of decidableItems) {
      const decision = decisionByItemId.get(item.id)!;
      await setQuoteItemDecision(item.id, decision, client);
    }

    const allApproved = decidableItems.every((i) => decisionByItemId.get(i.id) === "APROVADO");
    const allRejected = decidableItems.every((i) => decisionByItemId.get(i.id) === "RECUSADO");
    const overallDecision: "APROVADO" | "APROVADO_PARCIAL" | "RECUSADO" = allApproved
      ? "APROVADO"
      : allRejected
        ? "RECUSADO"
        : "APROVADO_PARCIAL";

    await createQuoteApproval(
      {
        quoteVersionId: version.id,
        decision: overallDecision,
        approverName: input.approverName,
        approverDocument: input.approverDocument,
        reason: input.reason,
        notes: input.notes,
        channel: "LINK",
        ipAddress: input.ipAddress,
      },
      client,
    );

    const decidedAt = new Date();
    const updatedVersion = await setQuoteVersionStatus(
      version.id,
      overallDecision,
      { decidedAt },
      client,
    );
    await updateQuoteStatusAndVersion(version.quoteId, overallDecision, version.versionNumber, client);

    return updatedVersion as QuoteVersionRecord;
  });

  await recordAuditLog({
    action: "QUOTE_DECIDED",
    entityType: "quote_version",
    entityId: result.id,
    metadata: { decision: result.status },
  });

  return result;
}

/**
 * Registra a decisão do cliente pela própria oficina (aprovação presencial,
 * por telefone/WhatsApp, ou serviço já realizado) — sem depender do link
 * público. Mesmas regras do link: todo item decidível recebe decisão,
 * INFORMATIVO nunca é decidido, resultado total/parcial/recusado calculado
 * igual, trava de linha contra concorrência. A diferença é o canal
 * (`PRESENCIAL`) e quem registra (usuário logado, gravado na auditoria).
 *
 * Aceita versões em RASCUNHO, ENVIADO ou EXPIRADO — o link público, se
 * existir, é revogado para o cliente não decidir de novo por cima.
 */
export async function registerInternalQuoteDecisionService(
  actorUserId: string,
  quoteId: string,
  rawInput: unknown,
): Promise<QuoteVersionRecord> {
  const input = quoteDecisionInputSchema.parse(rawInput) as QuoteDecisionInput;

  const quote = await findQuoteById(quoteId);
  if (!quote) throw new QuoteNotFoundError(quoteId);

  const current = await findQuoteVersionByNumber(quoteId, quote.currentVersionNumber);
  if (!current) throw new QuoteVersionNotFoundError(quoteId);

  const result = await withTransaction(async (client) => {
    const version = await lockQuoteVersionById(current.id, client);
    if (!version) throw new QuoteVersionNotFoundError(quoteId);

    if (version.status !== "RASCUNHO" && version.status !== "ENVIADO" && version.status !== "EXPIRADO") {
      throw new InvalidQuoteTransitionError(
        "Este orçamento já foi decidido ou cancelado — só dá para registrar a aprovação de um orçamento em rascunho, enviado ou expirado.",
      );
    }

    const items = await listQuoteItemsByVersion(version.id, client);
    if (items.length === 0) {
      throw new InvalidQuoteTransitionError("O orçamento não tem itens.");
    }

    const itemById = new Map(items.map((i) => [i.id, i]));
    for (const d of input.itemDecisions) {
      const item = itemById.get(d.itemId);
      if (!item) throw new QuoteItemsIncompleteDecisionError("Item não pertence a este orçamento.");
      if (item.category === "INFORMATIVO") {
        throw new QuoteItemsIncompleteDecisionError(
          "Item informativo não é decidível — não exige aprovação nem recusa do cliente.",
        );
      }
    }

    const decisionByItemId = new Map(input.itemDecisions.map((d) => [d.itemId, d.decision]));
    const decidableItems = items.filter((item) => item.category !== "INFORMATIVO");
    if (decidableItems.some((item) => !decisionByItemId.has(item.id))) {
      throw new QuoteItemsIncompleteDecisionError(
        "Todos os itens precisam de uma decisão (aprovado ou recusado) antes de confirmar.",
      );
    }

    for (const item of decidableItems) {
      await setQuoteItemDecision(item.id, decisionByItemId.get(item.id)!, client);
    }

    const allApproved = decidableItems.every((i) => decisionByItemId.get(i.id) === "APROVADO");
    const allRejected = decidableItems.every((i) => decisionByItemId.get(i.id) === "RECUSADO");
    const overallDecision: "APROVADO" | "APROVADO_PARCIAL" | "RECUSADO" = allApproved
      ? "APROVADO"
      : allRejected
        ? "RECUSADO"
        : "APROVADO_PARCIAL";

    await createQuoteApproval(
      {
        quoteVersionId: version.id,
        decision: overallDecision,
        approverName: input.approverName,
        approverDocument: input.approverDocument,
        reason: input.reason,
        notes: input.notes,
        channel: "PRESENCIAL",
      },
      client,
    );

    const now = new Date();
    const updatedVersion = await setQuoteVersionStatus(
      version.id,
      overallDecision,
      // Versão que nunca foi "enviada" (rascunho) ganha o sentAt agora, para
      // o histórico não ficar com decisão sem envio.
      { decidedAt: now, ...(version.sentAt ? {} : { sentAt: now }) },
      client,
    );
    await updateQuoteStatusAndVersion(version.quoteId, overallDecision, version.versionNumber, client);
    await revokeActiveLinksForVersion(version.id, client);

    return updatedVersion as QuoteVersionRecord;
  });

  await recordAuditLog({
    userId: actorUserId,
    action: "QUOTE_DECIDED",
    entityType: "quote_version",
    entityId: result.id,
    metadata: { decision: result.status, channel: "PRESENCIAL", registeredByOffice: true },
  });

  return result;
}

/** Exclusão real — distinta de cancelar (que mantém histórico). Bloqueada
 * se já existir OS criada a partir deste orçamento (checagem explícita:
 * a FK de sourceQuoteVersionId é SET NULL, não RESTRICT, então o banco
 * sozinho deixaria passar e silenciosamente desvincularia a OS). Versões
 * e itens cascateiam automaticamente. */
export async function deleteQuoteService(actorUserId: string, quoteId: string): Promise<void> {
  const quote = await findQuoteById(quoteId);
  if (!quote) throw new QuoteNotFoundError(quoteId);

  if (await quoteHasWorkOrder(quoteId)) {
    throw new QuoteNotDeletableError();
  }

  try {
    await deleteQuote(quoteId);
  } catch (err) {
    if (isForeignKeyViolation(err)) throw new QuoteNotDeletableError();
    throw err;
  }

  await recordAuditLog({
    userId: actorUserId,
    action: "QUOTE_DELETED",
    entityType: "quote",
    entityId: quoteId,
  });
}
