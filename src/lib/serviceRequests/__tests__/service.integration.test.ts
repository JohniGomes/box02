import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import {
  createServiceRequestService,
  listServiceRequestsService,
  setServiceRequestStatusService,
} from "@/lib/serviceRequests/service";
import { ServiceRequestNotFoundError } from "@/lib/serviceRequests/errors";

async function cleanAll() {
  await pool.query(
    `TRUNCATE "service_requests", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
}

let actorUserId: string;

beforeAll(async () => {
  await cleanAll();
  const hash = await hashPassword("senhaTeste123");
  const user = await createUser({ name: "Testador", email: "testador@teste.com", passwordHash: hash });
  actorUserId = user.id;
});

beforeEach(async () => {
  await pool.query(`TRUNCATE "service_requests" CASCADE`);
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("createServiceRequestService — pública, sem login", () => {
  it("cria uma solicitação pendente a partir dos dados do cliente", async () => {
    const request = await createServiceRequestService({
      customerName: "Maria Teste",
      customerPhone: "(62) 99999-8888",
      vehicleDescription: "Celta 2010, placa ABC1234",
      description: "Barulho no motor ao acelerar",
    });

    expect(request.customerName).toBe("Maria Teste");
    expect(request.customerPhone).toBe("62999998888");
    expect(request.vehicleDescription).toBe("Celta 2010, placa ABC1234");
    expect(request.status).toBe("PENDENTE");
    expect(request.attendedAt).toBeNull();
  });

  it("funciona sem veículo informado (campo opcional)", async () => {
    const request = await createServiceRequestService({
      customerName: "João Teste",
      customerPhone: "62988887777",
      description: "Preciso de uma revisão geral",
    });

    expect(request.vehicleDescription).toBeNull();
  });

  it("rejeita telefone implausível", async () => {
    await expect(
      createServiceRequestService({
        customerName: "Nome Válido",
        customerPhone: "123",
        description: "Descrição válida de teste",
      }),
    ).rejects.toThrow(ZodError);
  });

  it("rejeita nome muito curto e descrição muito curta", async () => {
    await expect(
      createServiceRequestService({
        customerName: "A",
        customerPhone: "62988887777",
        description: "oi",
      }),
    ).rejects.toThrow(ZodError);
  });
});

describe("listServiceRequestsService / setServiceRequestStatusService", () => {
  it("lista só pendentes por padrão e reflete a mudança de status", async () => {
    const r1 = await createServiceRequestService({
      customerName: "Cliente 1",
      customerPhone: "62988887777",
      description: "Descrição de teste número um",
    });
    await createServiceRequestService({
      customerName: "Cliente 2",
      customerPhone: "62988887778",
      description: "Descrição de teste número dois",
    });

    const pendentes = await listServiceRequestsService("PENDENTE");
    expect(pendentes).toHaveLength(2);

    const attended = await setServiceRequestStatusService(actorUserId, r1.id, "ATENDIDA");
    expect(attended.status).toBe("ATENDIDA");
    expect(attended.attendedByUserId).toBe(actorUserId);
    expect(attended.attendedAt).not.toBeNull();

    const pendentesAfter = await listServiceRequestsService("PENDENTE");
    expect(pendentesAfter).toHaveLength(1);

    const atendidas = await listServiceRequestsService("ATENDIDA");
    expect(atendidas).toHaveLength(1);
    expect(atendidas[0].id).toBe(r1.id);
  });

  it("descarta uma solicitação", async () => {
    const r = await createServiceRequestService({
      customerName: "Cliente 3",
      customerPhone: "62988887779",
      description: "Descrição de teste número três",
    });

    const discarded = await setServiceRequestStatusService(actorUserId, r.id, "DESCARTADA");
    expect(discarded.status).toBe("DESCARTADA");
  });

  it("lança erro ao tentar mudar status de solicitação inexistente", async () => {
    await expect(
      setServiceRequestStatusService(actorUserId, "id-inexistente", "ATENDIDA"),
    ).rejects.toThrow(ServiceRequestNotFoundError);
  });
});
