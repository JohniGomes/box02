import { describe, expect, it } from "vitest";
import { calcularMargemEstimada, calcularPrecoSugerido } from "../pricing";

describe("calcularPrecoSugerido — precedência (H4-D1, Alternativa D)", () => {
  it("cenário 1: com defaultPriceCents e costCents — sugestão vem do defaultPriceCents (manual)", () => {
    const result = calcularPrecoSugerido({ defaultPriceCents: 15000, costCents: 10000, markupPercent: 40 });
    expect(result).toEqual({ cents: 15000, source: "manual" });
  });

  it("cenário 2: sem defaultPriceCents, com costCents e markup — sugestão calculada", () => {
    const result = calcularPrecoSugerido({ defaultPriceCents: null, costCents: 10000, markupPercent: 40 });
    expect(result).toEqual({ cents: 14000, source: "calculado" });
  });

  it("cenário 3: sem nenhum dos dois — nenhuma sugestão", () => {
    const result = calcularPrecoSugerido({ defaultPriceCents: null, costCents: null, markupPercent: 40 });
    expect(result).toBeNull();
  });

  it("custo preenchido mas markup não configurado (null) — sem sugestão, nunca inventa markup", () => {
    const result = calcularPrecoSugerido({ defaultPriceCents: null, costCents: 10000, markupPercent: null });
    expect(result).toBeNull();
  });

  it("só defaultPriceCents preenchido (sem custo) — sugestão manual, como já era antes deste ciclo", () => {
    const result = calcularPrecoSugerido({ defaultPriceCents: 8000, costCents: null, markupPercent: null });
    expect(result).toEqual({ cents: 8000, source: "manual" });
  });
});

describe("calcularMargemEstimada — margem sobre venda (H4-D2), nunca markup", () => {
  it("exemplo do H4: custo R$100, praticado R$140 -> margem 28,57%", () => {
    const margem = calcularMargemEstimada({ costCents: 10000, practicedPriceCents: 14000 });
    expect(margem).not.toBeNull();
    expect(Math.round(margem! * 10000) / 100).toBeCloseTo(28.57, 1);
  });

  it("exemplo do H4: custo R$100, praticado R$120 -> margem 16,67%", () => {
    const margem = calcularMargemEstimada({ costCents: 10000, practicedPriceCents: 12000 });
    expect(margem).not.toBeNull();
    expect(Math.round(margem! * 10000) / 100).toBeCloseTo(16.67, 1);
  });

  it("sem custo cadastrado -> null (nunca inventa margem)", () => {
    const margem = calcularMargemEstimada({ costCents: null, practicedPriceCents: 10000 });
    expect(margem).toBeNull();
  });

  it("preço praticado igual a zero -> null, nunca NaN nem Infinity", () => {
    const margem = calcularMargemEstimada({ costCents: 10000, practicedPriceCents: 0 });
    expect(margem).toBeNull();
    expect(margem).not.toBeNaN();
  });
});
