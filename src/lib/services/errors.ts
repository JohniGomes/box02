export class ServiceNotFoundError extends Error {
  constructor(public readonly serviceId: string) {
    super("Serviço não encontrado.");
    this.name = "ServiceNotFoundError";
  }
}

/** Regra crítica do Ciclo B: o servidor SEMPRE valida que o serviceId
 * informado corresponde a um serviço ATIVO — nunca confia que a
 * interface só ofereceu ativos para seleção. */
export class ServiceNotActiveError extends Error {
  constructor() {
    super("O serviço selecionado não está mais ativo. Escolha outro ou digite um item personalizado.");
    this.name = "ServiceNotActiveError";
  }
}
