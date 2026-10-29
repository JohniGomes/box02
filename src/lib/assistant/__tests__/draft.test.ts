import { describe, expect, it } from "vitest";
import { buildAssistantDraft, type AssistantItemInput } from "../draft";

const cliente = { id: "c1", nome: "Maria da Silva" };
const veiculo = { id: "v1", label: "ABC-1D23 — Fiat Palio", mileage: 98000 };

const itens: AssistantItemInput[] = [
  { tipo: "SERVICO", descricao: "troca de óleo", quantidade: 1, precoUnitarioCentavos: 15000, registroId: "s1", registroNome: "Troca de óleo", acao: "USAR_EXISTENTE" },
  { tipo: "PECA", descricao: "filtro", quantidade: 2, precoUnitarioCentavos: null, precoSugeridoCentavos: 4500, registroId: "p1", registroNome: "Filtro de óleo", acao: "USAR_EXISTENTE" },
  { tipo: "PECA", descricao: "pastilha dianteira", quantidade: 1, precoUnitarioCentavos: null, acao: "CRIAR_NOVO" },
  { tipo: "OUTRO", descricao: "lavagem", quantidade: 1, precoUnitarioCentavos: null, acao: "IGNORAR" },
];

describe("rascunho montado pelo assistente", () => {
  it("orçamento: abre nos itens, usa nome e preço do cadastro e deixa o novo como texto livre", () => {
    const d = buildAssistantDraft({ tipo: "ORCAMENTO", cliente, veiculo, itens, observacoes: "Barulho ao frear", quilometragem: 98500 });
    expect(d.kind).toBe("QUOTE");
    expect(d.payload.step).toBe(2);
    expect(d.payload.customer).toEqual({ id: "c1", label: "Maria da Silva" });
    expect(d.payload.vehicle).toMatchObject({ id: "v1", mileage: 98000 });
    expect(d.payload.customerComplaint).toBe("Barulho ao frear");
    expect(d.payload.mileageAtEntry).toBe("98500");

    const items = d.payload.items as Record<string, unknown>[];
    expect(items).toHaveLength(3); // "OUTRO/IGNORAR" fica de fora
    expect(items[0]).toMatchObject({ type: "SERVICO", description: "Troca de óleo", quantity: "1", unitPriceReais: "150,00", serviceId: "s1", category: "NECESSARIO" });
    // sem valor falado: usa o do cadastro
    expect(items[1]).toMatchObject({ type: "PECA", description: "Filtro de óleo", quantity: "2", unitPriceReais: "45,00", partId: "p1" });
    // peça nova: texto livre, sem criar nada no estoque
    expect(items[2]).toMatchObject({ type: "PECA", description: "pastilha dianteira", unitPriceReais: "" });
    expect(items[2].partId).toBeUndefined();
    expect(new Set(items.map((i) => i.key)).size).toBe(3);
  });

  it("orçamento sem veículo abre na etapa do veículo", () => {
    const d = buildAssistantDraft({ tipo: "ORCAMENTO", cliente, veiculo: null, itens: [] });
    expect(d.payload.step).toBe(1);
    expect(d.payload.vehicle).toBeNull();
  });

  it("OS: formato do formulário de OS sem orçamento", () => {
    const d = buildAssistantDraft({ tipo: "OS", cliente, veiculo, itens, observacoes: "Barulho", quilometragem: 98500 });
    expect(d.kind).toBe("WORK_ORDER");
    expect(d.payload).toMatchObject({ customer: { id: "c1" }, vehicleId: "v1", mileageAtEntry: "98500", customerComplaint: "Barulho", diagnosis: "" });
    expect((d.payload.items as unknown[]).length).toBe(3);
  });
});
