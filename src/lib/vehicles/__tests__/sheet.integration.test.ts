import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService, updateVehicleSheetService } from "../service";
import { buildVehicleSheetText, vinModelYear } from "../sheet";

async function cleanAll() {
  await pool.query(
    `TRUNCATE "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
}

let actorUserId: string;
let customerId: string;

beforeAll(async () => {
  await cleanAll();
  actorUserId = (await createUser({ name: "Testador", email: "fc@teste.com", passwordHash: await hashPassword("senhaTeste123") })).id;
  customerId = (await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Ficha" })).id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("ano do modelo pelo chassi (sugestão, sem internet)", () => {
  const now = new Date("2026-10-29");
  it("lê o 10º caractere e escolhe o ano mais recente possível", () => {
    expect(vinModelYear("9BWZZZ377VT004251", now)).toBe(2027); // V = 2027 ou 1997: escolhe o mais recente que ainda é "ano que vem"
    expect(vinModelYear("9BWZZZ377YT004251", now)).toBe(2000); // Y = 2030 (futuro demais) ou 2000
    expect(vinModelYear("9BGKS48X0FG123456", now)).toBe(2015); // F = 2015
    expect(vinModelYear("9BGKS48X0TG123456", now)).toBe(2026); // T = 2026
    expect(vinModelYear("9BGKS48X09G123456", now)).toBe(2009); // 9 = 2009
  });
  it("devolve nada para chassi incompleto ou código inexistente", () => {
    expect(vinModelYear("ABC123", now)).toBeNull();
    expect(vinModelYear("9BGKS48X0UG123456", now)).toBeNull(); // U não é usado
    expect(vinModelYear(null, now)).toBeNull();
  });
});

describe("texto da ficha para o fornecedor", () => {
  it("monta só com o que foi preenchido", () => {
    const text = buildVehicleSheetText({ brand: "Volkswagen", model: "Gol", version: "1.0 flex", yearManufacture: "2015", yearModel: "2016", plate: "abc1d23", chassis: "9bwzzz377vt004251", part: "pastilha dianteira" });
    expect(text).toContain("Veículo: Volkswagen Gol 1.0 flex");
    expect(text).toContain("Ano: 2015/2016");
    expect(text).toContain("Placa: ABC1D23");
    expect(text).toContain("Chassi: 9BWZZZ377VT004251");
    expect(text).toContain("Peça: pastilha dianteira");
    expect(buildVehicleSheetText({ model: "Palio" })).not.toContain("Placa");
  });
});

describe("salvar a ficha no cadastro do veículo", () => {
  it("atualiza marca/modelo/versão/anos/chassi e preserva cliente, placa, cor e KM", async () => {
    const v = await createVehicleService(actorUserId, { customerId, plate: "FIC1A23", color: "Prata", mileage: 120000, notes: "obs" });
    const updated = await updateVehicleSheetService(actorUserId, v.id, { brand: "Fiat", model: "Palio", version: "1.0 flex", yearManufacture: "2014", yearModel: "2015", chassis: "9BD17164FFF123456" });
    expect(updated).toMatchObject({ brand: "Fiat", model: "Palio", version: "1.0 flex", yearManufacture: 2014, yearModel: 2015, chassis: "9BD17164FFF123456" });
    expect(updated).toMatchObject({ customerId, plate: "FIC1A23", color: "Prata", mileage: 120000, notes: "obs" });
  });
});
