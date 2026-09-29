import { withTransaction } from "@/lib/db/transaction";
import {
  createQuote,
  findQuoteById,
  searchQuotes,
  updateQuoteStatusAndVersion,
  type QuoteRecord,
  type SearchQuotesFilters,
} from "@/lib/db/repositories/quotes";
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
import { recordAuditLog } from "@/lib/db/repositories/auditLog";
import { generateQuoteNumber } from "./numbering";
import { generateQuoteAccessToken } from "./token";
import { assertServiceIsActive } from "@/lib/services/service";
import { getQuoteDefaultValidityDays } from "@/lib/settings/service";
import { computeQuoteTotals, lineTotalCents, reaisToCents } from "@/lib/money";
import { quoteInputSchema, type QuoteInput } from "@/lib/validation/quote";
import { quoteDecisionInputSchema, type QuoteDecisionInput } from "@/lib/validation/quoteApproval";
import {
  InvalidQuoteTransitionError,
  QuoteAccessTokenNotFoundError,
  QuoteAlreadyDecidedError,
  QuoteItemsIncompleteDecisionError,
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
    const unitPriceCents = reaisToCents(item.unitPriceReais);
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
      { number, customerId: input.customerId, vehicleId: input.vehicleId, createdByUserId: actorUserId },
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
        category: item.category,
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
        category: item.category,
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
        category: item.category,
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
): Promise<QuoteVersionRecord> {
  const quote = await findQuoteById(quoteId);
  if (!quote) throw new QuoteNotFoundError(quoteId);

  const currentVersion = await findQuoteVersionByNumber(quoteId, quote.currentVersionNumber);
  if (!currentVersion) throw new QuoteVersionNotFoundError(quoteId);
  if (currentVersion.status !== "RASCUNHO" && currentVersion.status !== "ENVIADO") {
    throw new InvalidQuoteTransitionError(
      "Só é possível cancelar um orçamento em rascunho ou aguardando decisão do cliente.",
    );
  }

  const updated = await setQuoteVersionStatus(currentVersion.id, "CANCELADO");
  await updateQuoteStatusAndVersion(quoteId, "CANCELADO", quote.currentVersionNumber);

  await recordAuditLog({
    userId: actorUserId,
    action: "QUOTE_CANCELLED",
    entityType: "quote_version",
    entityId: currentVersion.id,
  });

  return updated as QuoteVersionRecord;
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
