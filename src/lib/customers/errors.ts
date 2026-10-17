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

export class CustomerNotDeletableError extends Error {
  constructor() {
    super(
      "Este cliente não pode ser excluído — já tem veículo, orçamento, OS ou agendamento vinculado. Use \"Inativar\" em vez de excluir.",
    );
    this.name = "CustomerNotDeletableError";
  }
}
