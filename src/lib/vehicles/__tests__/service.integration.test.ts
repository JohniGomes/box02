import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import {
  createVehicleService,
  getVehicleService,
  inactivateVehicleService,
  listVehiclesByCustomerService,
  reactivateVehicleService,
  searchVehiclesService,
  transferVehicleService,
  updateVehicleService,
} from "../service";
import {
  DuplicateVehiclePlateError,
  VehicleCustomerNotFoundError,
  VehicleNotFoundError,
} from "../errors";

async function cleanAll() {
  await pool.query(
    'TRUNCATE "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE',
  );
}

let actorUserId: string;
let customerAId: string;
let customerBId: string;

beforeAll(async () => {
  await cleanAll();
  const hash = await hashPassword("senhaTeste123");
  const user = await createUser({ name: "Testador", email: "testador@teste.com", passwordHash: hash });
  actorUserId = user.id;
});

beforeEach(async () => {
  await pool.query('TRUNCATE "vehicles", "customers" CASCADE');
  const a = await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente A" });
  const b = await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente B" });
  customerAId = a.id;
  customerBId = b.id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("createVehicleService", () => {
  it("cria veículo vinculado a um cliente existente", async () => {
    const vehicle = await createVehicleService(actorUserId, {
      customerId: customerAId,
      plate: "ABC-1234",
      brand: "Volkswagen",
      model: "Gol",
    });

    expect(vehicle.customerId).toBe(customerAId);
    expect(vehicle.plate).toBe("ABC1234"); // normalizada
    expect(vehicle.status).toBe("ATIVO");
  });

  it("permite cadastrar sem placa", async () => {
    const vehicle = await createVehicleService(actorUserId, { customerId: customerAId });
    expect(vehicle.plate).toBeNull();
  });

  it("rejeita cliente inexistente", async () => {
    await expect(
      createVehicleService(actorUserId, { customerId: "id-invalido", plate: "ABC1234" }),
    ).rejects.toThrow(VehicleCustomerNotFoundError);
  });

  it("rejeita placa com formato inválido", async () => {
    await expect(
      createVehicleService(actorUserId, { customerId: customerAId, plate: "XYZ-99" }),
    ).rejects.toThrow();
  });

  it("impede duplicidade de placa entre veículos diferentes", async () => {
    await createVehicleService(actorUserId, { customerId: customerAId, plate: "ABC-1234" });

    await expect(
      createVehicleService(actorUserId, { customerId: customerBId, plate: "ABC-1234" }),
    ).rejects.toThrow(DuplicateVehiclePlateError);
  });

  it("trata ABC-1234 e ABC1234 como a mesma placa para fins de duplicidade", async () => {
    await createVehicleService(actorUserId, { customerId: customerAId, plate: "ABC-1234" });

    await expect(
      createVehicleService(actorUserId, { customerId: customerBId, plate: "ABC1234" }),
    ).rejects.toThrow(DuplicateVehiclePlateError);
  });

  it("permite dois veículos sem placa (não força unicidade quando ausente)", async () => {
    await createVehicleService(actorUserId, { customerId: customerAId });
    const v2 = await createVehicleService(actorUserId, { customerId: customerBId });
    expect(v2).toBeTruthy();
  });

  it("grava auditoria ao criar veículo", async () => {
    const vehicle = await createVehicleService(actorUserId, { customerId: customerAId, brand: "Fiat" });

    const logs = await pool.query(
      `SELECT action FROM audit_logs WHERE "entityId" = $1 AND action = 'VEHICLE_CREATED'`,
      [vehicle.id],
    );
    expect(logs.rowCount).toBe(1);
  });
});

describe("relacionamento cliente-veículo", () => {
  it("cliente com vários veículos: todos aparecem na listagem por cliente", async () => {
    await createVehicleService(actorUserId, { customerId: customerAId, plate: "AAA-1111" });
    await createVehicleService(actorUserId, { customerId: customerAId, plate: "BBB-2222" });
    await createVehicleService(actorUserId, { customerId: customerBId, plate: "CCC-3333" });

    const vehiclesOfA = await listVehiclesByCustomerService(customerAId);
    expect(vehiclesOfA).toHaveLength(2);
    expect(vehiclesOfA.every((v) => v.customerId === customerAId)).toBe(true);
  });

  it("veículo criado aparece vinculado ao cliente correto ao ser buscado por id", async () => {
    const vehicle = await createVehicleService(actorUserId, { customerId: customerBId, plate: "DDD-4444" });
    const found = await getVehicleService(vehicle.id);
    expect(found?.customerId).toBe(customerBId);
  });
});

describe("updateVehicleService", () => {
  it("edita dados de um veículo existente", async () => {
    const created = await createVehicleService(actorUserId, { customerId: customerAId, mileage: 1000 });
    const updated = await updateVehicleService(actorUserId, created.id, {
      customerId: customerAId,
      mileage: 5000,
      color: "Prata",
    });
    expect(updated.mileage).toBe(5000);
    expect(updated.color).toBe("Prata");
  });

  it("lança erro ao editar veículo inexistente", async () => {
    await expect(
      updateVehicleService(actorUserId, "nao-existe", { customerId: customerAId }),
    ).rejects.toThrow(VehicleNotFoundError);
  });

  it("impede alterar placa para uma já usada por outro veículo", async () => {
    await createVehicleService(actorUserId, { customerId: customerAId, plate: "EEE-5555" });
    const other = await createVehicleService(actorUserId, { customerId: customerBId, plate: "FFF-6666" });

    await expect(
      updateVehicleService(actorUserId, other.id, { customerId: customerBId, plate: "EEE-5555" }),
    ).rejects.toThrow(DuplicateVehiclePlateError);
  });
});

describe("inativação preserva histórico", () => {
  it("inativa sem apagar o registro nem seus dados", async () => {
    const created = await createVehicleService(actorUserId, {
      customerId: customerAId,
      plate: "GGG-7777",
      brand: "Chevrolet",
    });

    await inactivateVehicleService(actorUserId, created.id);

    const stillThere = await getVehicleService(created.id);
    expect(stillThere).not.toBeNull();
    expect(stillThere?.status).toBe("INATIVO");
    expect(stillThere?.plate).toBe("GGG7777");
    expect(stillThere?.brand).toBe("Chevrolet");
  });

  it("reativa um veículo inativo", async () => {
    const created = await createVehicleService(actorUserId, { customerId: customerAId });
    await inactivateVehicleService(actorUserId, created.id);
    const reactivated = await reactivateVehicleService(actorUserId, created.id);
    expect(reactivated.status).toBe("ATIVO");
  });
});

describe("transferência de veículo entre clientes", () => {
  it("transfere o veículo preservando o registro (histórico via audit log)", async () => {
    const vehicle = await createVehicleService(actorUserId, { customerId: customerAId, plate: "HHH-8888" });

    const transferred = await transferVehicleService(actorUserId, vehicle.id, customerBId);
    expect(transferred.customerId).toBe(customerBId);

    // o veículo não some da lista geral, só muda de dono
    const stillFound = await getVehicleService(vehicle.id);
    expect(stillFound?.id).toBe(vehicle.id);
    expect(stillFound?.plate).toBe("HHH8888");

    const logs = await pool.query(
      `SELECT metadata FROM audit_logs WHERE "entityId" = $1 AND action = 'VEHICLE_TRANSFERRED'`,
      [vehicle.id],
    );
    expect(logs.rowCount).toBe(1);
    expect(logs.rows[0].metadata.fromCustomerId).toBe(customerAId);
    expect(logs.rows[0].metadata.toCustomerId).toBe(customerBId);
  });

  it("rejeita transferência para cliente inexistente", async () => {
    const vehicle = await createVehicleService(actorUserId, { customerId: customerAId });
    await expect(
      transferVehicleService(actorUserId, vehicle.id, "cliente-invalido"),
    ).rejects.toThrow(VehicleCustomerNotFoundError);
  });

  it("veículo transferido some da lista do cliente antigo e aparece na do novo", async () => {
    const vehicle = await createVehicleService(actorUserId, { customerId: customerAId, plate: "III-9999" });
    await transferVehicleService(actorUserId, vehicle.id, customerBId);

    const ofA = await listVehiclesByCustomerService(customerAId);
    const ofB = await listVehiclesByCustomerService(customerBId);
    expect(ofA.some((v) => v.id === vehicle.id)).toBe(false);
    expect(ofB.some((v) => v.id === vehicle.id)).toBe(true);
  });
});

describe("busca de veículos", () => {
  beforeEach(async () => {
    await createVehicleService(actorUserId, {
      customerId: customerAId,
      plate: "JJJ-0001",
      brand: "Toyota",
      model: "Corolla",
    });
    const inactiveVehicle = await createVehicleService(actorUserId, {
      customerId: customerBId,
      plate: "KKK-0002",
    });
    await inactivateVehicleService(actorUserId, inactiveVehicle.id);
  });

  it("encontra veículo por placa sem máscara", async () => {
    const result = await searchVehiclesService({ query: "JJJ0001" });
    expect(result.items.some((v) => v.plate === "JJJ0001")).toBe(true);
  });

  it("encontra veículo por placa com máscara (hífen)", async () => {
    const result = await searchVehiclesService({ query: "JJJ-0001" });
    expect(result.items.some((v) => v.plate === "JJJ0001")).toBe(true);
  });

  it("encontra veículo por marca/modelo", async () => {
    const result = await searchVehiclesService({ query: "Corolla" });
    expect(result.items.some((v) => v.model === "Corolla")).toBe(true);
  });

  it("encontra veículo pelo nome do cliente", async () => {
    const result = await searchVehiclesService({ query: "Cliente A" });
    expect(result.items.some((v) => v.customerName === "Cliente A")).toBe(true);
  });

  it("por padrão (status ATIVO) não retorna veículos inativos", async () => {
    const result = await searchVehiclesService({ status: "ATIVO" });
    expect(result.items.some((v) => v.plate === "KKK0002")).toBe(false);
  });

  it("filtra por cliente específico", async () => {
    const result = await searchVehiclesService({ customerId: customerAId });
    expect(result.items.every((v) => v.customerId === customerAId)).toBe(true);
  });
});
