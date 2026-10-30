import { describe, expect, it } from "vitest";
import { priceToleranceWarning } from "../priceTolerance";

describe("aviso de 20% no preço do serviço", () => {
  it("dentro de 20% não avisa (nem no limite)", () => {
    expect(priceToleranceWarning("100,00", "100,00")).toBeNull();
    expect(priceToleranceWarning("100,00", "120,00")).toBeNull();
    expect(priceToleranceWarning("100,00", "80,00")).toBeNull();
  });

  it("acima ou abaixo de 20% avisa, dizendo quanto e que é só um aviso", () => {
    expect(priceToleranceWarning("100,00", "150,00")).toMatch(/50% acima.*só um aviso/);
    expect(priceToleranceWarning("100,00", "50,00")).toMatch(/50% abaixo/);
  });

  it("sem preço padrão, valor vazio ou inválido: não avisa e não quebra", () => {
    expect(priceToleranceWarning(undefined, "150,00")).toBeNull();
    expect(priceToleranceWarning("0,00", "150,00")).toBeNull();
    expect(priceToleranceWarning("100,00", "")).toBeNull();
    expect(priceToleranceWarning("100,00", "abc")).toBeNull();
  });
});
