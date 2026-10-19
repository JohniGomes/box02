export class ServiceRequestNotFoundError extends Error {
  constructor(public readonly serviceRequestId: string) {
    super("Solicitação não encontrada.");
    this.name = "ServiceRequestNotFoundError";
  }
}
