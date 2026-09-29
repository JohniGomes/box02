export class ReconciliationEntryNotFoundError extends Error {
  constructor() {
    super("Lançamento não encontrado para conciliação.");
    this.name = "ReconciliationEntryNotFoundError";
  }
}

export class ExpenseNotPaidError extends Error {
  constructor() {
    super("Só é possível conciliar uma despesa já paga — esta ainda está em aberto.");
    this.name = "ExpenseNotPaidError";
  }
}
