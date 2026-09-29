export class ExpenseNotFoundError extends Error {
  constructor(public readonly expenseId: string) {
    super("Despesa não encontrada.");
    this.name = "ExpenseNotFoundError";
  }
}

/** Uma despesa já paga não pode ser editada nem paga de novo neste
 * primeiro corte da Fatia 1 — corrigir um lançamento errado depois de
 * pago fica para uma revisão futura, se o dia a dia pedir. */
export class ExpenseAlreadyPaidError extends Error {
  constructor() {
    super("Esta despesa já está paga — não pode ser editada ou paga novamente.");
    this.name = "ExpenseAlreadyPaidError";
  }
}
