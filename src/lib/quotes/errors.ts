export class VehicleNotOwnedByCustomerError extends Error {
  constructor() {
    super("O veículo selecionado não pertence ao cliente selecionado.");
    this.name = "VehicleNotOwnedByCustomerError";
  }
}

export class QuoteNotFoundError extends Error {
  constructor(public readonly quoteId: string) {
    super("Orçamento não encontrado.");
    this.name = "QuoteNotFoundError";
  }
}

export class QuoteVersionNotFoundError extends Error {
  constructor(public readonly quoteVersionId: string) {
    super("Versão do orçamento não encontrada.");
    this.name = "QuoteVersionNotFoundError";
  }
}

/** Tentativa de editar itens/valores de uma versão que não está em RASCUNHO. */
export class QuoteVersionNotEditableError extends Error {
  constructor() {
    super("Esta versão do orçamento não pode mais ser editada — crie uma nova versão.");
    this.name = "QuoteVersionNotEditableError";
  }
}

/** Transição de status inválida (ex.: enviar um orçamento já cancelado). */
export class InvalidQuoteTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidQuoteTransitionError";
  }
}

/** Token de acesso público inexistente. Mensagem deliberadamente genérica
 * — nunca revela se o token "quase existiu" ou qualquer detalhe interno. */
export class QuoteAccessTokenNotFoundError extends Error {
  constructor() {
    super("Link inválido ou não encontrado.");
    this.name = "QuoteAccessTokenNotFoundError";
  }
}

/** Versão já decidida, cancelada ou expirada — decisão não pode ser
 * aplicada de novo (cobre também o caso de segunda submissão). */
export class QuoteAlreadyDecidedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteAlreadyDecidedError";
  }
}

/** Pelo menos um item da versão não recebeu decisão (APROVADO/RECUSADO),
 * ou a decisão se refere a um item que não pertence a esta versão. */
export class QuoteItemsIncompleteDecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteItemsIncompleteDecisionError";
  }
}
