export class PartNotFoundError extends Error {
  constructor(public readonly partId: string) {
    super("Peça não encontrada.");
    this.name = "PartNotFoundError";
  }
}

export class DuplicatePartSkuError extends Error {
  constructor(public readonly sku: string) {
    super(`Já existe uma peça cadastrada com o SKU "${sku}".`);
    this.name = "DuplicatePartSkuError";
  }
}

export class DuplicatePartNameError extends Error {
  constructor(public readonly name_: string) {
    super(`Já existe uma peça chamada "${name_}". Use "Selecionar do estoque" para escolher ela.`);
    this.name = "DuplicatePartNameError";
  }
}

/** Dado inválido ao cadastrar a peça comprada (mensagem já pronta p/ o usuário). */
export class InvalidPurchasedPartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPurchasedPartError";
  }
}

export class InsufficientStockError extends Error {
  constructor(public readonly available: number, public readonly requested: number) {
    super(`Estoque insuficiente — disponível: ${available}, solicitado: ${requested}.`);
    this.name = "InsufficientStockError";
  }
}

/** Mesma regra crítica de `ServiceNotActiveError`: o servidor SEMPRE
 * valida que o partId informado corresponde a uma peça ATIVA — nunca
 * confia que a interface só ofereceu peças ativas para seleção. */
export class PartNotActiveError extends Error {
  constructor() {
    super("A peça selecionada não está mais ativa. Escolha outra ou digite um item personalizado.");
    this.name = "PartNotActiveError";
  }
}
