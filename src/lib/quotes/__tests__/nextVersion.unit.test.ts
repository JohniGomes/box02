import { describe, expect, it } from "vitest";
import { nextQuoteVersionNumber } from "../service";

describe("nextQuoteVersionNumber", () => {
  it("sem versões descartadas é a atual + 1", () => {
    expect(nextQuoteVersionNumber(1, [{ versionNumber: 1 }])).toBe(2);
  });

  it("depois de descartar a versão 2, a próxima é a 3 (a 2 fica no histórico)", () => {
    expect(nextQuoteVersionNumber(1, [{ versionNumber: 1 }, { versionNumber: 2 }])).toBe(3);
  });

  it("usa o maior número mesmo que a lista venha fora de ordem", () => {
    expect(nextQuoteVersionNumber(2, [{ versionNumber: 3 }, { versionNumber: 1 }, { versionNumber: 2 }])).toBe(4);
  });
});
