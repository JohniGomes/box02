import { describe, expect, it } from "vitest";
import { applyCardFeePatch, cardFeeOfRow, type CardFeeRow } from "@/lib/cardFee";

function row(patch: Partial<CardFeeRow> = {}): CardFeeRow {
  return { method: "CARTAO", amount: "1000,00", rate: "", gross: "", installments: "", ...patch };
}

describe("cardFeeOfRow", () => {
  it("só existe taxa no cartão", () => {
    expect(cardFeeOfRow(row({ method: "PIX", rate: "6,69", gross: "1.071,70" }))).toBe(0);
  });

  it("sem taxa e sem valor passado no cartão, não há taxa", () => {
    expect(cardFeeOfRow(row())).toBe(0);
  });

  it("pela porcentagem: a taxa incide sobre o valor passado no cartão", () => {
    // serviço R$ 1.000 com 6,69%: o cliente passa R$ 1.071,70 e a taxa é R$ 71,70
    expect(cardFeeOfRow(row({ rate: "6,69" }))).toBe(7170);
  });

  it("pelo valor total passado no cartão", () => {
    expect(cardFeeOfRow(row({ gross: "1.071,70" }))).toBe(7170);
  });

  it("o valor passado no cartão tem prioridade sobre a porcentagem", () => {
    expect(cardFeeOfRow(row({ rate: "3,00", gross: "1.071,70" }))).toBe(7170);
  });

  it("valor passado menor que o do serviço não gera taxa negativa", () => {
    expect(cardFeeOfRow(row({ gross: "900,00" }))).toBe(0);
  });

  it("porcentagem inválida é ignorada", () => {
    expect(cardFeeOfRow(row({ rate: "abc" }))).toBe(0);
    expect(cardFeeOfRow(row({ rate: "45" }))).toBe(0);
  });
});

describe("applyCardFeePatch", () => {
  it("com a taxa e o total passado, o valor do serviço sai da conta", () => {
    const next = applyCardFeePatch(row({ amount: "" }), { rate: "6,69", gross: "1.071,70" });
    expect(next.amount).toBe("1000,00");
  });

  it("mexer só nas parcelas não muda o valor do serviço", () => {
    const next = applyCardFeePatch(row({ amount: "874,00", rate: "6,69", gross: "1.071,70" }), { installments: "10" });
    expect(next.amount).toBe("874,00");
    expect(next.installments).toBe("10");
  });

  it("só a taxa (sem total passado) não muda o valor do serviço", () => {
    const next = applyCardFeePatch(row({ amount: "874,00" }), { rate: "6,83" });
    expect(next.amount).toBe("874,00");
    expect(next.rate).toBe("6,83");
  });
});
