/** Dado inválido ao registrar uma compra (mensagem já pronta para o usuário). */
export class InvalidPurchaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPurchaseError";
  }
}

export class SupplierNotFoundError extends Error {
  constructor() {
    super("Fornecedor não encontrado ou inativo.");
    this.name = "SupplierNotFoundError";
  }
}
