export class DuplicateCustomerDocumentError extends Error {
  constructor(public readonly document: string) {
    super("Já existe um cliente cadastrado com este CPF/CNPJ.");
    this.name = "DuplicateCustomerDocumentError";
  }
}

export class CustomerNotFoundError extends Error {
  constructor(public readonly customerId: string) {
    super("Cliente não encontrado.");
    this.name = "CustomerNotFoundError";
  }
}
