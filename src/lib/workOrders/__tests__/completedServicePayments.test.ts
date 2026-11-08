import { describe, expect, it } from "vitest";
import type { CardFeeRow } from "@/lib/cardFee";
import { buildCompletedServicePayments } from "@/lib/workOrders/completedServicePayments";

function row(patch: Partial<CardFeeRow> = {}): CardFeeRow {
  return { method: "PIX", amount: "100,00", rate: "", gross: "", installments: "", ...patch };
}

describe("buildCompletedServicePayments", () => {
  it("pagamento simples, sem taxa nem parcelas", () => {
    expect(buildCompletedServicePayments([row({ amount: "874,00" })])).toEqual([{ method: "PIX", amountReais: "874,00" }]);
  });

  it("cartão em 10x com a taxa em porcentagem", () => {
    const out = buildCompletedServicePayments([row({ method: "CARTAO", amount: "874,00", rate: "6,83", installments: "10" })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ method: "CARTAO", amountReais: "874,00", installments: "10" });
    // taxa sobre o valor passado no cartão: 874 / (1 − 0,0683) − 874 = 64,07 (arredondado em centavos)
    expect(out[0].cardFeeReais).toBe("64,07");
  });

  it("cartão com o valor total passado no cartão", () => {
    const out = buildCompletedServicePayments([row({ method: "CARTAO", amount: "1000,00", gross: "1.071,70", installments: "4" })]);
    expect(out[0]).toEqual({ method: "CARTAO", amountReais: "1000,00", cardFeeReais: "71,70", installments: "4" });
  });

  it("cartão sem taxa informada: vai só com as parcelas (taxa fica em branco)", () => {
    const out = buildCompletedServicePayments([row({ method: "CARTAO", amount: "874,00", installments: "10" })]);
    expect(out[0]).toEqual({ method: "CARTAO", amountReais: "874,00", installments: "10" });
    expect(out[0].cardFeeReais).toBeUndefined();
  });

  it("taxa e parcelas só valem para cartão: em outra forma são descartadas", () => {
    const out = buildCompletedServicePayments([row({ method: "PIX", amount: "100,00", rate: "6,83", gross: "110,00", installments: "3" })]);
    expect(out).toEqual([{ method: "PIX", amountReais: "100,00" }]);
  });

  it("linhas vazias ou zeradas são ignoradas (pagamento parcial ou nenhum)", () => {
    expect(buildCompletedServicePayments([row({ amount: "" }), row({ amount: "0,00" })])).toEqual([]);
    const parcial = buildCompletedServicePayments([row({ amount: "500,00" }), row({ method: "DINHEIRO", amount: "" })]);
    expect(parcial).toEqual([{ method: "PIX", amountReais: "500,00" }]);
  });

  it("várias formas de pagamento mantêm a ordem", () => {
    const out = buildCompletedServicePayments([
      row({ method: "PIX", amount: "300,00" }),
      row({ method: "CARTAO", amount: "574,00", installments: "2" }),
    ]);
    expect(out.map((p) => p.method)).toEqual(["PIX", "CARTAO"]);
  });
});
