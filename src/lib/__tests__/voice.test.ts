import { describe, expect, it } from "vitest";
import { appendTranscript, speechErrorMessage } from "../voice";

describe("ditado por voz", () => {
  it("junta o que foi falado ao texto que já existia", () => {
    expect(appendTranscript("", "troca de óleo ")).toBe("troca de óleo");
    expect(appendTranscript("Maria, Palio ", "troca de óleo")).toBe("Maria, Palio troca de óleo");
    expect(appendTranscript("texto", "   ")).toBe("texto");
  });

  it("explica os erros do microfone em português simples", () => {
    expect(speechErrorMessage("not-allowed")).toMatch(/Permita o microfone/);
    expect(speechErrorMessage("no-speech")).toMatch(/Não ouvi nada/);
    expect(speechErrorMessage("qualquer-outro")).toMatch(/Digite o texto/);
  });
});
