export class QuoteNotApprovedError extends Error {
  constructor() {
    super("Só é possível converter em OS um orçamento aprovado (total ou parcialmente).");
    this.name = "QuoteNotApprovedError";
  }
}

export class WorkOrderNotFoundError extends Error {
  constructor(public readonly workOrderId: string) {
    super("Ordem de serviço não encontrada.");
    this.name = "WorkOrderNotFoundError";
  }
}

export class InvalidWorkOrderTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWorkOrderTransitionError";
  }
}

export class WorkOrderItemNotFoundError extends Error {
  constructor(public readonly itemId: string) {
    super("Item da ordem de serviço não encontrado.");
    this.name = "WorkOrderItemNotFoundError";
  }
}

export class InvalidWorkOrderItemTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWorkOrderItemTransitionError";
  }
}

export class WorkOrderHasPendingItemsError extends Error {
  constructor() {
    super("Existem itens ainda pendentes (nem executados, nem cancelados) — decida todos antes de fechar a OS.");
    this.name = "WorkOrderHasPendingItemsError";
  }
}

// ============================================================
// Sub-etapa 2 — Adicionais durante a execução
// ============================================================

/** AD-4: bloqueio rígido, sem exceção para nenhum perfil. */
export class AdditionalItemNotAuthorizedError extends Error {
  constructor() {
    super("Este item adicional ainda não tem autorização do cliente registrada — não pode ser executado.");
    this.name = "AdditionalItemNotAuthorizedError";
  }
}

export class AdditionalItemAlreadyDecidedError extends Error {
  constructor(message = "Este adicional já não está mais aguardando decisão (pode já ter sido decidido, revogado ou cancelado).") {
    super(message);
    this.name = "AdditionalItemAlreadyDecidedError";
  }
}

export class AdditionalItemAccessTokenNotFoundError extends Error {
  constructor() {
    super("Link inválido ou não encontrado.");
    this.name = "AdditionalItemAccessTokenNotFoundError";
  }
}

export class AdditionalItemNotEligibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdditionalItemNotEligibleError";
  }
}

// ============================================================
// Ciclo E — Execução dos Checklists na OS
// ============================================================

export class WorkOrderChecklistNotFoundError extends Error {
  constructor() {
    super("Checklist da OS não encontrado.");
    this.name = "WorkOrderChecklistNotFoundError";
  }
}

export class WorkOrderChecklistItemNotFoundError extends Error {
  constructor() {
    super("Item de checklist da OS não encontrado.");
    this.name = "WorkOrderChecklistItemNotFoundError";
  }
}

/** Nem ENTRADA/ENTREGA (ativo) nem, para EXECUCAO, o serviço do item tem
 * checklist associado — não há molde disponível para copiar. */
export class NoChecklistTemplateAvailableError extends Error {
  constructor(type: string) {
    super(`Não há checklist ${type} disponível para iniciar.`);
    this.name = "NoChecklistTemplateAvailableError";
  }
}

/** Regra central do Ciclo E (EX-2, já aprovada): fechamento bloqueado
 * quando existe instância de checklist de ENTREGA nesta OS com item
 * obrigatório ainda não marcado. Ausência de instância nunca bloqueia. */
export class WorkOrderDeliveryChecklistPendingError extends Error {
  constructor(pendingDescriptions: string[]) {
    super(
      `Checklist de entrega tem item(ns) obrigatório(s) pendente(s): ${pendingDescriptions.join(", ")}.`,
    );
    this.name = "WorkOrderDeliveryChecklistPendingError";
  }
}

// ============================================================
// Ciclo F — Termo de Recepção
// ============================================================

/** Gate de negócio (DEC-1): transição para EM_EXECUCAO exige aceite de
 * recepção já registrado. EM_DIAGNOSTICO e CANCELADA nunca são afetados. */
export class WorkOrderReceptionNotAcceptedError extends Error {
  constructor() {
    super("A OS não pode avançar para execução sem o aceite de recepção registrado.");
    this.name = "WorkOrderReceptionNotAcceptedError";
  }
}

/** Write-once (DEC-7 / ponto 2 da revisão): uma vez registrado, o aceite
 * de recepção nunca é reescrito por esta função de serviço. */
export class WorkOrderReceptionAlreadyAcceptedError extends Error {
  constructor() {
    super("O aceite de recepção desta OS já foi registrado e não pode ser substituído.");
    this.name = "WorkOrderReceptionAlreadyAcceptedError";
  }
}

// ============================================================
// Ciclo I — Recebimentos (Financeiro mínimo)
// ============================================================

/** Lançamento só permitido com a OS ENTREGUE — a obrigação financeira só
 * nasce no fechamento (DEC-I2, já aprovada). */
export class WorkOrderNotDeliveredError extends Error {
  constructor() {
    super("Só é possível registrar recebimento em uma OS já entregue.");
    this.name = "WorkOrderNotDeliveredError";
  }
}

/** DEC-I8: nunca permitir lançamento acima do saldo restante — sem
 * sobrepagamento, sem crédito, sem estorno neste ciclo. */
export class WorkOrderPaymentExceedsBalanceError extends Error {
  constructor(remainingCents: number) {
    super(`O valor informado ultrapassa o saldo restante da OS (R$ ${(remainingCents / 100).toFixed(2)}).`);
    this.name = "WorkOrderPaymentExceedsBalanceError";
  }
}

// ============================================================
// Ciclo M — Estorno de recebimento (DEC-I6 revisitada)
// ============================================================

export class WorkOrderPaymentNotFoundError extends Error {
  constructor() {
    super("Recebimento não encontrado para esta OS.");
    this.name = "WorkOrderPaymentNotFoundError";
  }
}

/** A soma dos estornos de um recebimento nunca pode ultrapassar o valor
 * original dele — o recebimento em si continua write-once (DEC-I6). */
export class WorkOrderPaymentRefundExceedsAmountError extends Error {
  constructor(availableCents: number) {
    super(`O estorno ultrapassa o valor disponível deste recebimento (R$ ${(availableCents / 100).toFixed(2)}).`);
    this.name = "WorkOrderPaymentRefundExceedsAmountError";
  }
}

// ============================================================
// Ciclo J — Evidências/Fotos
// ============================================================

/** DEC-J5: depois do aceite de recepção, evidências existentes ficam
 * imutáveis — sem editar, sem excluir. Adicionar continua sempre
 * permitido (não lança este erro). Substituição = excluir + criar,
 * então também fica bloqueada depois do aceite, pela mesma checagem. */
export class WorkOrderEvidenceLockedError extends Error {
  constructor() {
    super("Esta evidência não pode mais ser excluída — o aceite de recepção desta OS já foi registrado.");
    this.name = "WorkOrderEvidenceLockedError";
  }
}

export class WorkOrderEvidenceNotFoundError extends Error {
  constructor(id: string) {
    super(`Evidência ${id} não encontrada para esta OS.`);
    this.name = "WorkOrderEvidenceNotFoundError";
  }
}

// ============================================================
// Ciclo L — Rastreabilidade de Execução por Mecânico
// ============================================================

/** O executor informado (na execução ou numa correção posterior) não é um
 * usuário ativo do sistema — evita registrar um id inválido ou de usuário
 * desativado como quem executou o item. */
export class InvalidExecutorUserError extends Error {
  constructor() {
    super("Usuário selecionado não é válido para ser registrado como executor.");
    this.name = "InvalidExecutorUserError";
  }
}
