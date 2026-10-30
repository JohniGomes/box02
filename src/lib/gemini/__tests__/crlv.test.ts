import { describe, expect, it } from "vitest";
import { extractVehicleFromCrlv, mapFuel } from "../crlv";
import { GeminiBadResponseError } from "../errors";

describe("combustível do CRLV vira uma opção do formulário", () => {
  it("mapeia os textos do documento", () => {
    expect(mapFuel("ALCOOL/GASOLINA")).toBe("Flex");
    expect(mapFuel("Gasolina")).toBe("Gasolina");
    expect(mapFuel("ÁLCOOL")).toBe("Etanol");
    expect(mapFuel("DIESEL")).toBe("Diesel");
    expect(mapFuel("GASOLINA/GNV")).toBe("GNV");
    expect(mapFuel("ELÉTRICO")).toBe("Elétrico");
    expect(mapFuel("outro")).toBeUndefined();
    expect(mapFuel(undefined)).toBeUndefined();
  });
});

describe("leitura do CRLV", () => {
  const photo = "AAAA";

  it("normaliza placa, chassi, RENAVAM e anos; ignora dados do proprietário", async () => {
    const runner = async () =>
      JSON.stringify({
        placa: "abc1234",
        chassi: "9bw zzz 377vt004251",
        renavam: "0123.456.789-0",
        marca: "Volkswagen",
        modelo: "Gol",
        versao: "1.6 MSI",
        anoFabricacao: "2014",
        anoModelo: 2015,
        cor: "Prata",
        combustivel: "ALCOOL/GASOLINA",
        confianca: "ALTA",
        // a IA não deveria devolver isto, mas se devolver não pode passar adiante
        proprietario: "Fulano de Tal",
        cpf: "12345678909",
      });
    const data = await extractVehicleFromCrlv(photo, "image/jpeg", { runner, models: ["m"] });
    expect(data).toEqual({
      placa: "ABC-1234",
      chassi: "9BWZZZ377VT004251",
      renavam: "01234567890",
      marca: "Volkswagen",
      modelo: "Gol",
      versao: "1.6 MSI",
      anoFabricacao: 2014,
      anoModelo: 2015,
      cor: "Prata",
      combustivel: "Flex",
      confianca: "ALTA",
    });
    expect(JSON.stringify(data)).not.toMatch(/Fulano|12345678909/);
  });

  it("placa Mercosul fica como está; ano absurdo e campos vazios somem", async () => {
    const runner = async () => JSON.stringify({ placa: "BRA2E19", anoFabricacao: 1800, anoModelo: null, marca: "  ", modelo: null, confianca: "XYZ" });
    const data = await extractVehicleFromCrlv(photo, "image/jpeg", { runner, models: ["m"] });
    expect(data.placa).toBe("BRA2E19");
    expect(data.anoFabricacao).toBeUndefined();
    expect(data.marca).toBeUndefined();
    expect(data.confianca).toBe("BAIXA");
  });

  it("resposta que não é JSON vira erro amigável", async () => {
    const runner = async () => "não consegui ler";
    await expect(extractVehicleFromCrlv(photo, "image/jpeg", { runner, models: ["m"] })).rejects.toBeInstanceOf(GeminiBadResponseError);
  });
});
