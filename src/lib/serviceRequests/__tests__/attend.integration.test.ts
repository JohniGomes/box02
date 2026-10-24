import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import {
  attendServiceRequestService,
  createServiceRequestService,
  plateOfServiceRequest,
  previewServiceRequestMatchesService,
  undoServiceRequestAttendanceService,
} from "@/lib/serviceRequests/service";
import { ServiceRequestNotPendingError } from "@/lib/serviceRequests/errors";
import { findAppointmentById } from "@/lib/db/repositories/appointments";

async function cleanAll() {
  await pool.query(
    `TRUNCATE "service_requests", "appointments", "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
}

let actorUserId: string;

beforeAll(async () => {
  await cleanAll();
  actorUserId = (await createUser({ name: "Testador", email: "at@teste.com", passwordHash: await hashPassword("senhaTeste123") })).id;
});

beforeEach(async () => {
  await pool.query(`TRUNCATE "service_requests", "appointments", "vehicles", "customers" CASCADE`);
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

const base = { customerName: "Maria Teste", customerPhone: "(62) 99999-8888", description: "Barulho na frente ao frear" };

describe("solicitação: placa e melhor horário", () => {
  it("guarda placa em maiúsculas e melhor dia/horário, e acha a placa no texto do veículo", async () => {
    const r = await createServiceRequestService({ ...base, vehiclePlate: "abc-1d23", preferredTime: "sexta de manhã", vehicleDescription: "Celta 2010" });
    expect(r.vehiclePlate).toBe("ABC1D23");
    expect(r.preferredTime).toBe("sexta de manhã");

    const semCampo = await createServiceRequestService({ ...base, vehicleDescription: "Celta 2010, placa ABC-1234" });
    expect(plateOfServiceRequest(semCampo)).toBe("ABC1234");
  });
});

describe("Atender", () => {
  it("cliente novo e veículo novo: cria tudo, agenda e liga a solicitação", async () => {
    const r = await createServiceRequestService({ ...base, vehicleDescription: "Celta 2010", vehiclePlate: "ABC1D23" });
    const preview = await previewServiceRequestMatchesService(r.id);
    expect(preview.customers).toHaveLength(0);

    const done = await attendServiceRequestService(actorUserId, r.id, { vehicle: "NEW", scheduledAt: "2026-11-10T09:00" });
    expect(done.status).toBe("ATENDIDA");
    expect(done.customerId).not.toBeNull();
    expect(done.vehicleId).not.toBeNull();
    const appt = await findAppointmentById(done.appointmentId!);
    expect(appt).toMatchObject({ status: "AGENDADO", customerId: done.customerId, vehicleId: done.vehicleId, description: base.description });
    const v = (await pool.query(`SELECT plate, model FROM vehicles WHERE id = $1`, [done.vehicleId])).rows[0];
    expect(v.plate).toBe("ABC1D23");
    expect(v.model).toBe("Celta 2010");
  });

  it("acha o cliente pelo telefone e o veículo pela placa e vincula sem duplicar", async () => {
    const c = await createCustomerService(actorUserId, { type: "PF", legalName: "Maria da Silva", phone: "62999998888", whatsapp: "62999998888" });
    const v = await createVehicleService(actorUserId, { customerId: c.id, plate: "ABC1D23", model: "Celta" });
    const r = await createServiceRequestService({ ...base, vehiclePlate: "ABC1D23" });

    const preview = await previewServiceRequestMatchesService(r.id);
    expect(preview.customers.map((x) => x.id)).toEqual([c.id]);
    expect(preview.vehiclesByCustomer[c.id].map((x) => x.id)).toEqual([v.id]);
    expect(preview.plateOwner?.customerId).toBe(c.id);

    const done = await attendServiceRequestService(actorUserId, r.id, { customerId: c.id, vehicle: v.id, scheduledAt: "2026-11-10T09:00" });
    expect(done.customerId).toBe(c.id);
    expect(done.vehicleId).toBe(v.id);
    expect((await pool.query(`SELECT count(*)::int AS n FROM customers`)).rows[0].n).toBe(1);
    expect((await pool.query(`SELECT count(*)::int AS n FROM vehicles`)).rows[0].n).toBe(1);
  });

  it("sem escolher cliente, reaproveita o cadastro com o mesmo telefone", async () => {
    const c = await createCustomerService(actorUserId, { type: "PF", legalName: "Maria da Silva", phone: "62999998888", whatsapp: "62999998888" });
    const r = await createServiceRequestService(base);
    const done = await attendServiceRequestService(actorUserId, r.id, { vehicle: "NONE", scheduledAt: "2026-11-10T09:00" });
    expect(done.customerId).toBe(c.id);
    expect(done.vehicleId).toBeNull();
    expect((await pool.query(`SELECT count(*)::int AS n FROM customers`)).rows[0].n).toBe(1);
  });

  it("não atende duas vezes e desfazer volta para pendente cancelando o agendamento", async () => {
    const r = await createServiceRequestService(base);
    const done = await attendServiceRequestService(actorUserId, r.id, { vehicle: "NONE", scheduledAt: "2026-11-10T09:00" });
    await expect(attendServiceRequestService(actorUserId, r.id, { vehicle: "NONE", scheduledAt: "2026-11-11T09:00" })).rejects.toThrow(ServiceRequestNotPendingError);

    const reopened = await undoServiceRequestAttendanceService(actorUserId, r.id);
    expect(reopened).toMatchObject({ status: "PENDENTE", customerId: null, appointmentId: null });
    expect((await findAppointmentById(done.appointmentId!))!.status).toBe("CANCELADO");
    // o cliente cadastrado fica
    expect((await pool.query(`SELECT count(*)::int AS n FROM customers`)).rows[0].n).toBe(1);
  });
});
