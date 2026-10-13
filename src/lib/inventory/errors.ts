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

export class InsufficientStockError extends Error {
  constructor(public readonly available: number, public readonly requested: number) {
    super(`Estoque insuficiente — disponível: ${available}, solicitado: ${requested}.`);
    this.name = "InsufficientStockError";
  }
}
