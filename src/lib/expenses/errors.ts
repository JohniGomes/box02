export class ExpenseNotFoundError extends Error {
  constructor(public readonly expenseId: string) {
    super("Despesa não encontrada.");
    this.name = "ExpenseNotFoundError";
  }
}

export class ExpenseNotPaidError extends Error {
  constructor() {
    super("Esta despesa não está paga — não há pagamento para desfazer.");
    this.name = "ExpenseNotPaidError";
  }
}

export class ExpenseReconciledError extends Error {
  constructor() {
    super("Esta despesa já foi conciliada com o extrato do banco — desfaça a conciliação antes de desfazer o pagamento.");
    this.name = "ExpenseReconciledError";
  }
}

export class ExpenseDuplicateError extends Error {
  constructor(dueDate: string) {
    super(`Já existe uma despesa igual com vencimento em ${dueDate.split("-").reverse().join("/")}.`);
    this.name = "ExpenseDuplicateError";
  }
}

export class ExpensePaidInFutureError extends Error {
  constructor() {
    super("A data do pagamento não pode ser no futuro.");
    this.name = "ExpensePaidInFutureError";
  }
}

/** Uma despesa já paga não pode ser editada nem paga de novo. Para corrigir
 * um pagamento marcado por engano, use "Desfazer pagamento" (volta a ficar
 * em aberto, com registro de quem desfez) e marque de novo. */
export class ExpenseAlreadyPaidError extends Error {
  constructor() {
    super("Esta despesa já está paga — não pode ser editada ou paga novamente.");
    this.name = "ExpenseAlreadyPaidError";
  }
}

/** "Corrigir texto" só vale para despesa já paga; a em aberto usa "Editar". */
export class ExpenseNotPaidForTextEditError extends Error {
  constructor() {
    super("Esta despesa ainda não está paga — use \"Editar\".");
    this.name = "ExpenseNotPaidForTextEditError";
  }
}
