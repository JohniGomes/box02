import { describe, expect, it, vi } from "vitest";

// Teste de unidade da validação de entrada: o pool é simulado, nenhuma conexão com banco é aberta.
vi.mock("@/lib/db/pool", () => ({ pool: { query: vi.fn() } }));

import { registerCompletedServiceSchema } from "../retroactive";

const base = { serviceDate: "2026-11-07", executedBy: "executor:c1", deliveryAcceptedName: "Michele" };

describe("registerCompletedServiceSchema (atalho de serviço concluído e pago)", () => {
  it("aceita cartão em 10x com taxa e parcelas", () => {
    const parsed = registerCompletedServiceSchema.parse({
      ...base,
      payments: [{ method: "CARTAO", amountReais: "874,00", cardFeeReais: "64,07", installments: "10" }],
    });
    expect(parsed.payments[0]).toMatchObject({ method: "CARTAO", cardFeeReais: "64,07", installments: "10" });
  });

  it("taxa e parcelas continuam opcionais", () => {
    const parsed = registerCompletedServiceSchema.parse({ ...base, payments: [{ method: "PIX", amountReais: "100,00" }] });
    expect(parsed.payments[0].cardFeeReais).toBeUndefined();
    expect(parsed.payments[0].installments).toBeUndefined();
  });

  it("sem pagamento nenhum é válido (o valor fica em A receber)", () => {
    expect(registerCompletedServiceSchema.parse(base).payments).toEqual([]);
  });

  it("aceita mais de um executor marcado junto", () => {
    expect(registerCompletedServiceSchema.parse({ ...base, executedBy: "executor:c1,executor:m1" }).executedBy).toBe("executor:c1,executor:m1");
  });

  it("recusa sem executor ou sem quem retirou o veículo", () => {
    expect(() => registerCompletedServiceSchema.parse({ ...base, executedBy: "" })).toThrow();
    expect(() => registerCompletedServiceSchema.parse({ ...base, deliveryAcceptedName: "" })).toThrow();
  });
});
