export class AppointmentNotFoundError extends Error {
  constructor(public readonly appointmentId: string) {
    super("Agendamento não encontrado.");
    this.name = "AppointmentNotFoundError";
  }
}

export class AppointmentCustomerNotFoundError extends Error {
  constructor() {
    super("Cliente não encontrado.");
    this.name = "AppointmentCustomerNotFoundError";
  }
}

export class AppointmentVehicleNotOwnedByCustomerError extends Error {
  constructor() {
    super("O veículo selecionado não pertence ao cliente selecionado.");
    this.name = "AppointmentVehicleNotOwnedByCustomerError";
  }
}

export class AppointmentAlreadyCancelledError extends Error {
  constructor() {
    super("Este agendamento já está cancelado.");
    this.name = "AppointmentAlreadyCancelledError";
  }
}

export class AppointmentNotEditableError extends Error {
  constructor() {
    super("Só dá para corrigir um agendamento que ainda está agendado.");
    this.name = "AppointmentNotEditableError";
  }
}

export class AppointmentLinkError extends Error {
  constructor() {
    super("Não foi possível ligar este agendamento a essa OS (ela já está ligada a outro agendamento ou não é deste cliente).");
    this.name = "AppointmentLinkError";
  }
}
