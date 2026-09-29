export class ProcedureNotFoundError extends Error {
  constructor() {
    super("Procedimento não encontrado.");
    this.name = "ProcedureNotFoundError";
  }
}

export class ProcedureCodeAlreadyExistsError extends Error {
  constructor(code: string) {
    super(`Já existe um procedimento com o código "${code}".`);
    this.name = "ProcedureCodeAlreadyExistsError";
  }
}

export class ChecklistNotFoundError extends Error {
  constructor() {
    super("Checklist não encontrado.");
    this.name = "ChecklistNotFoundError";
  }
}

export class ChecklistCodeAlreadyExistsError extends Error {
  constructor(code: string) {
    super(`Já existe um checklist com o código "${code}".`);
    this.name = "ChecklistCodeAlreadyExistsError";
  }
}

export class ChecklistItemNotFoundError extends Error {
  constructor() {
    super("Item de checklist não encontrado.");
    this.name = "ChecklistItemNotFoundError";
  }
}

/** ENTRADA/ENTREGA: no máximo um ATIVO por vez — regra de negócio,
 * validada no servidor. Ativar um novo exige inativar o antigo primeiro,
 * de forma explícita — nunca desativação implícita/automática. */
export class ActiveChecklistOfTypeAlreadyExistsError extends Error {
  constructor(type: string, existingCode: string) {
    super(
      `Já existe um checklist ATIVO do tipo ${type} (${existingCode}). Inative-o antes de ativar outro do mesmo tipo.`,
    );
    this.name = "ActiveChecklistOfTypeAlreadyExistsError";
  }
}
