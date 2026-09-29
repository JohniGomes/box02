import { describe, expect, it } from "vitest";
import { formatPlate, isValidPlate, normalizePlate } from "../plate";
import { vehicleInputSchema, normalizeVehicleInput } from "../vehicle";

describe("normalização de placa", () => {
  it("trata ABC-1234 e ABC1234 como a mesma placa", () => {
    expect(normalizePlate("ABC-1234")).toBe(normalizePlate("ABC1234"));
    expect(normalizePlate("ABC-1234")).toBe("ABC1234");
  });

  it("remove espaços e força maiúsculas", () => {
    expect(normalizePlate(" abc 1234 ")).toBe("ABC1234");
  });
});

describe("validação de placa", () => {
  it("aceita formato antigo (ABC1234)", () => {
    expect(isValidPlate("ABC1234")).toBe(true);
    expect(isValidPlate("abc-1234")).toBe(true);
  });

  it("aceita formato Mercosul (ABC1D23)", () => {
    expect(isValidPlate("ABC1D23")).toBe(true);
  });

  it("rejeita placa com tamanho errado", () => {
    expect(isValidPlate("ABC123")).toBe(false);
    expect(isValidPlate("ABC12345")).toBe(false);
  });

  it("rejeita placa com formato inválido", () => {
    expect(isValidPlate("1234ABC")).toBe(false);
  });
});

describe("formatPlate", () => {
  it("formata placa antiga com hífen", () => {
    expect(formatPlate("ABC1234")).toBe("ABC-1234");
  });

  it("não adiciona hífen em placa Mercosul", () => {
    expect(formatPlate("ABC1D23")).toBe("ABC1D23");
  });
});

describe("schema de veículo (zod)", () => {
  it("aceita veículo válido sem placa", () => {
    const result = vehicleInputSchema.safeParse({
      customerId: "cliente-1",
      brand: "Volkswagen",
      model: "Gol",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita quando não há customerId", () => {
    const result = vehicleInputSchema.safeParse({ customerId: "", brand: "Fiat" });
    expect(result.success).toBe(false);
  });

  it("rejeita placa com formato inválido", () => {
    const result = vehicleInputSchema.safeParse({
      customerId: "cliente-1",
      plate: "XYZ-99",
    });
    expect(result.success).toBe(false);
  });

  it("aceita placa com formatação (normaliza depois)", () => {
    const result = vehicleInputSchema.safeParse({
      customerId: "cliente-1",
      plate: "abc-1234",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita ano de fabricação fora de faixa plausível", () => {
    const result = vehicleInputSchema.safeParse({
      customerId: "cliente-1",
      yearManufacture: "1800",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita quilometragem negativa", () => {
    const result = vehicleInputSchema.safeParse({
      customerId: "cliente-1",
      mileage: "-10",
    });
    expect(result.success).toBe(false);
  });

  it("normalizeVehicleInput deixa a placa só com letras/números maiúsculos", () => {
    const parsed = vehicleInputSchema.parse({
      customerId: "cliente-1",
      plate: "abc-1234",
    });
    const normalized = normalizeVehicleInput(parsed);
    expect(normalized.plate).toBe("ABC1234");
  });
});
