import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createQuickVehicleService } from "../service";

let actorUserId: string;
let customerId: string;

async function cleanAll() {
  await pool.query(
    `TRUNCATE "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
}

beforeAll(async () => {
  await cleanAll();
  const user = await createUser({ name: "Testador", email: "qv@teste.com", passwordHash: await hashPassword("senhaTeste123") });
  actorUserId = user.id;
  customerId = (await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Veículo Rápido" })).id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("cadastro rápido de veículo — ano do modelo", () => {
  it("grava o ano do modelo quando informado", async () => {
    const { vehicle } = await createQuickVehicleService(actorUserId, { customerId, model: "Palio", plate: "QVA1B23", year: "2012" });
    expect(vehicle.yearModel).toBe(2012);
  });

  it("recusa ano inválido", async () => {
    await expect(
      createQuickVehicleService(actorUserId, { customerId, model: "Gol", year: "1800" }),
    ).rejects.toThrow(/Ano do modelo inválido/);
  });

  it("continua funcionando sem ano", async () => {
    const { vehicle } = await createQuickVehicleService(actorUserId, { customerId, model: "Onix" });
    expect(vehicle.yearModel).toBeNull();
  });
});
