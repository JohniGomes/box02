export class DuplicateVehiclePlateError extends Error {
  constructor(public readonly plate: string) {
    super("Já existe um veículo cadastrado com esta placa.");
    this.name = "DuplicateVehiclePlateError";
  }
}

export class VehicleNotFoundError extends Error {
  constructor(public readonly vehicleId: string) {
    super("Veículo não encontrado.");
    this.name = "VehicleNotFoundError";
  }
}

export class VehicleCustomerNotFoundError extends Error {
  constructor(public readonly customerId: string) {
    super("Cliente selecionado não foi encontrado.");
    this.name = "VehicleCustomerNotFoundError";
  }
}
