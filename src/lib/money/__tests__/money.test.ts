import { describe, expect, it } from "vitest";
import {
  applyAdjustment,
  centsToReais,
  computeQuoteTotals,
  formatBRL,
  lineTotalCents,
  reaisToCents,
} from "../index";

describe("reaisToCents", () => {
  it("converte string com vírgula", () => {
    expect(reaisToCents("129,90")).toBe(12990);
  });

  it("converte string com ponto decimal", () => {
    expect(reaisToCents("129.90")).toBe(12990);
  });

  it("converte string com separador de milhar e vírgula decimal", () => {
    expect(reaisToCents("1.234,56")).toBe(123456);
  });

  it("converte número diretamente", () => {
    expect(reaisToCents(129.9)).toBe(12990);
  });

  it("nunca perde centavo por arredondamento em valor 'quebrado'", () => {
    expect(reaisToCents("33,33")).toBe(3333);
    expect(reaisToCents("0,10")).toBe(10);
    expect(reaisToCents("0,01")).toBe(1);
  });

  it("retorna 0 para entrada inválida em vez de quebrar", () => {
    expect(reaisToCents("abc")).toBe(0);
  });
});

describe("centsToReais / formatBRL", () => {
  it("formata centavos de volta para reais com vírgula", () => {
    expect(centsToReais(12990)).toBe("129,90");
  });

  it("formatBRL inclui o prefixo R$", () => {
    expect(formatBRL(12990)).toBe("R$ 129,90");
  });

  it("mantém duas casas mesmo para valores redondos", () => {
    expect(centsToReais(10000)).toBe("100,00");
  });
});

describe("lineTotalCents", () => {
  it("multiplica quantidade por preço unitário", () => {
    expect(lineTotalCents(2, 5000)).toBe(10000);
  });

  it("arredonda ao centavo mais próximo em quantidade fracionária", () => {
    // 1,5 hora × R$ 33,33 = R$ 49,995 -> arredonda para 5000 centavos
    expect(lineTotalCents(1.5, 3333)).toBe(5000);
  });
});

describe("applyAdjustment", () => {
  it("retorna 0 quando não há tipo/valor definido", () => {
    expect(applyAdjustment(10000, null, null)).toBe(0);
    expect(applyAdjustment(10000, undefined, undefined)).toBe(0);
  });

  it("calcula percentual corretamente (1050 = 10,50%)", () => {
    expect(applyAdjustment(10000, "PERCENTUAL", 1050)).toBe(1050);
  });

  it("calcula valor fixo diretamente em centavos", () => {
    expect(applyAdjustment(10000, "FIXO", 2000)).toBe(2000);
  });

  it("nunca retorna valor negativo mesmo com entrada negativa", () => {
    expect(applyAdjustment(10000, "FIXO", -500)).toBe(0);
  });
});

describe("computeQuoteTotals", () => {
  it("separa subtotais por tipo corretamente", () => {
    const totals = computeQuoteTotals({
      items: [
        { type: "SERVICO", totalCents: 10000 },
        { type: "PECA", totalCents: 5000 },
        { type: "MAO_DE_OBRA", totalCents: 3000 },
      ],
    });
    expect(totals.subtotalServicesCents).toBe(10000);
    expect(totals.subtotalPartsCents).toBe(5000);
    expect(totals.subtotalLaborCents).toBe(3000);
    expect(totals.totalCents).toBe(18000);
  });

  it("aplica desconto percentual sobre o subtotal de itens", () => {
    const totals = computeQuoteTotals({
      items: [{ type: "SERVICO", totalCents: 10000 }],
      discountType: "PERCENTUAL",
      discountValue: 1000, // 10%
    });
    expect(totals.discountTotalCents).toBe(1000);
    expect(totals.totalCents).toBe(9000);
  });

  it("aplica acréscimo sobre o valor JÁ COM desconto, não sobre o bruto", () => {
    const totals = computeQuoteTotals({
      items: [{ type: "SERVICO", totalCents: 10000 }],
      discountType: "PERCENTUAL",
      discountValue: 1000, // 10% -> 9000
      surchargeType: "PERCENTUAL",
      surchargeValue: 1000, // 10% de 9000 = 900
    });
    expect(totals.discountTotalCents).toBe(1000);
    expect(totals.surchargeTotalCents).toBe(900);
    expect(totals.totalCents).toBe(9900);
  });

  it("nunca deixa o total ficar negativo mesmo com desconto maior que o subtotal", () => {
    const totals = computeQuoteTotals({
      items: [{ type: "SERVICO", totalCents: 5000 }],
      discountType: "FIXO",
      discountValue: 100000,
    });
    expect(totals.totalCents).toBeGreaterThanOrEqual(0);
  });

  it("três itens de R$ 33,33 somam sem perder centavo", () => {
    const itemCents = reaisToCents("33,33");
    const totals = computeQuoteTotals({
      items: [
        { type: "SERVICO", totalCents: itemCents },
        { type: "SERVICO", totalCents: itemCents },
        { type: "SERVICO", totalCents: itemCents },
      ],
    });
    expect(totals.totalCents).toBe(9999);
  });
});
