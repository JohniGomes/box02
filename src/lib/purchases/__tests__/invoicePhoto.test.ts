import { describe, expect, it } from "vitest";
import { bestPartMatch, matchSupplier, nameSimilarity } from "../nameMatch";
import { extractPurchaseInvoice } from "@/lib/gemini/invoice";
import { GeminiBadResponseError } from "@/lib/gemini/errors";

describe("ligação por nome com o estoque e os fornecedores", () => {
  const parts = [
    { id: "p1", name: "Filtro de óleo Gol" },
    { id: "p2", name: "Pastilha de freio dianteira" },
    { id: "p3", name: "Óleo 5W30 sintético" },
  ];

  it("ignora maiúsculas, acentos e artigos", () => {
    expect(nameSimilarity("FILTRO OLEO GOL", "Filtro de óleo Gol")).toBe(1);
    expect(bestPartMatch("FILTRO OLEO GOL", parts)?.id).toBe("p1");
    expect(bestPartMatch("Pastilha freio dianteira", parts)?.id).toBe("p2");
  });

  it("nome só parecido não liga sozinho (vira peça nova): melhor duplicar do que dar entrada na peça errada", () => {
    expect(bestPartMatch("Filtro de óleo", parts)).toBeNull(); // sem o modelo: 2 de 3 palavras
    expect(bestPartMatch("Correia dentada", parts)).toBeNull();
    expect(bestPartMatch("", parts)).toBeNull();
  });

  it("fornecedor: mesmo nome ou um contido no outro; nome curto não liga", () => {
    const suppliers = [{ id: "s1", name: "Auto Peças Central" }, { id: "s2", name: "Distribuidora Norte" }];
    expect(matchSupplier("AUTO PECAS CENTRAL LTDA", suppliers)?.id).toBe("s1");
    expect(matchSupplier("auto peças central", suppliers)?.id).toBe("s1");
    expect(matchSupplier("Loja Nova", suppliers)).toBeNull();
    expect(matchSupplier("ab", suppliers)).toBeNull();
  });
});

describe("leitura da foto da nota", () => {
  const photo = "AAAA";
  const today = "2026-10-30";

  it("normaliza itens, data e frete; só fornecedor e compra, nada do comprador", async () => {
    const runner = async () =>
      JSON.stringify({
        fornecedor: "Auto Peças Central",
        data: "2026-10-28",
        itens: [
          { descricao: "Filtro de óleo", quantidade: "2", valorTotalCentavos: 6000, valorUnitarioCentavos: 3000 },
          { descricao: "Pastilha", quantidade: 1, valorTotalCentavos: null, valorUnitarioCentavos: "12.990" },
          { descricao: "  ", quantidade: 1, valorTotalCentavos: 100 },
          { descricao: "Sem valor", quantidade: 0, valorTotalCentavos: null, valorUnitarioCentavos: null },
        ],
        freteCentavos: 1500,
        descontoCentavos: 500,
        confianca: "MEDIA",
        compradorNome: "Fulano",
        compradorCpf: "12345678909",
      });
    const data = await extractPurchaseInvoice(photo, "image/jpeg", today, { runner, models: ["m"] });
    expect(data).toEqual({
      fornecedor: "Auto Peças Central",
      data: "2026-10-28",
      itens: [
        { descricao: "Filtro de óleo", quantidade: 2, totalCents: 6000 },
        { descricao: "Pastilha", quantidade: 1, totalCents: 12990 }, // só tinha o unitário
        { descricao: "Sem valor", quantidade: 1, totalCents: null }, // quantidade mínima 1; valor fica para a pessoa
      ],
      ajusteCents: 1000,
      confianca: "MEDIA",
    });
    expect(JSON.stringify(data)).not.toMatch(/Fulano|12345678909/);
  });

  it("data futura ou inválida é descartada; sem frete/desconto não há ajuste", async () => {
    const futuro = async () => JSON.stringify({ data: "2027-01-05", itens: [], confianca: "ALTA" });
    expect((await extractPurchaseInvoice(photo, "image/jpeg", today, { runner: futuro, models: ["m"] })).data).toBeUndefined();
    const invalida = async () => JSON.stringify({ data: "2026-02-31", itens: [], freteCentavos: 0, descontoCentavos: 0 });
    const r = await extractPurchaseInvoice(photo, "image/jpeg", today, { runner: invalida, models: ["m"] });
    expect(r.data).toBeUndefined();
    expect(r.ajusteCents).toBeUndefined();
    expect(r.confianca).toBe("BAIXA");
  });

  it("resposta que não é JSON vira erro amigável", async () => {
    const runner = async () => "não consegui ler";
    await expect(extractPurchaseInvoice(photo, "image/jpeg", today, { runner, models: ["m"] })).rejects.toBeInstanceOf(GeminiBadResponseError);
  });
});
