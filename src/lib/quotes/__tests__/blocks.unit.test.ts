import { describe, expect, it } from "vitest";
import { groupItemsForDisplay, type BlockableItem } from "../blocks";

function item(id: string, type: BlockableItem["type"], totalCents: number, groupKey: string | null = null): BlockableItem {
  return { id, type, totalCents, groupKey };
}

describe("groupItemsForDisplay", () => {
  it("itens sem bloco continuam soltos e na mesma ordem", () => {
    const out = groupItemsForDisplay([item("a", "SERVICO", 100), item("b", "PECA", 50)]);
    expect(out.map((e) => e.kind)).toEqual(["single", "single"]);
  });

  it("junta o serviço com as suas peças e soma o total do bloco sem duplicar", () => {
    // Serviço a R$ 0 + 4 peças = bloco de R$ 235 (caso da troca de óleo e filtros).
    const items = [
      item("svc", "SERVICO", 0, "g1"),
      item("outro", "SERVICO", 12000),
      item("oleo", "PECA", 16000, "g1"),
      item("fo", "PECA", 2000, "g1"),
      item("far", "PECA", 3000, "g1"),
      item("fc", "PECA", 2500, "g1"),
    ];
    const out = groupItemsForDisplay(items);
    expect(out).toHaveLength(2);
    const block = out[0];
    expect(block.kind).toBe("block");
    if (block.kind !== "block") throw new Error("esperava bloco");
    expect(block.head.id).toBe("svc");
    expect(block.children.map((c) => c.id)).toEqual(["oleo", "fo", "far", "fc"]);
    expect(block.totalCents).toBe(23500);
    // A soma de tudo que aparece bate com a soma dos itens originais.
    const shown = out.reduce((sum, e) => sum + (e.kind === "block" ? e.totalCents : e.item.totalCents), 0);
    expect(shown).toBe(items.reduce((sum, i) => sum + i.totalCents, 0));
  });

  it("a cabeça do bloco é o serviço, mesmo que a peça venha primeiro", () => {
    const out = groupItemsForDisplay([item("p", "PECA", 1000, "g"), item("s", "SERVICO", 500, "g")]);
    const block = out[0];
    if (block.kind !== "block") throw new Error("esperava bloco");
    expect(block.head.id).toBe("s");
    expect(block.children.map((c) => c.id)).toEqual(["p"]);
  });

  it("bloco com um item só vira item solto", () => {
    const out = groupItemsForDisplay([item("s", "SERVICO", 500, "g")]);
    expect(out).toEqual([{ kind: "single", item: item("s", "SERVICO", 500, "g") }]);
  });
});
