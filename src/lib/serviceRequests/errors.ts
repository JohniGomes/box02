export class ServiceRequestNotFoundError extends Error {
  constructor(public readonly serviceRequestId: string) {
    super("Solicitação não encontrada.");
    this.name = "ServiceRequestNotFoundError";
  }
}

export class ServiceRequestNotPendingError extends Error {
  constructor() {
    super("Esta solicitação já foi atendida ou descartada.");
    this.name = "ServiceRequestNotPendingError";
  }
}

export class ServiceRequestNotAttendedError extends Error {
  constructor() {
    super("Só dá para desfazer uma solicitação que está atendida.");
    this.name = "ServiceRequestNotAttendedError";
  }
}
