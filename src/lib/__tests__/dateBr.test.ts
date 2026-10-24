import { describe, expect, it } from "vitest";
import { InvalidEventDateError, formatDateBR, formatDateTimeBR, formatTimeBR, resolveEventInstant, todayBR } from "../dateBr";

// 24/10/2026 11:30 em Brasília = 14:30 UTC
const NOW = new Date("2026-10-24T14:30:00Z");

describe("horário de Brasília", () => {
  it("mostra o instante no fuso de Brasília, não no do servidor", () => {
    // 15:00 UTC = 12:00 em Brasília
    expect(formatDateTimeBR("2026-10-23T15:00:00Z")).toBe("23/10/2026, 12:00:00");
    expect(formatTimeBR("2026-10-23T15:00:00Z")).toBe("12:00");
  });

  it("depois das 21h de Brasília o dia continua o certo", () => {
    // 00:30 UTC do dia 22 = 21:30 de 21/10 em Brasília
    expect(formatDateBR("2026-10-22T00:30:00Z")).toBe("21/10/2026");
  });

  it("todayBR devolve o dia de Brasília", () => {
    expect(todayBR(new Date("2026-10-25T01:00:00Z"))).toBe("2026-10-24");
  });
});

describe("resolveEventInstant", () => {
  it("hoje, sem hora: usa o instante atual (antes do meio-dia também)", () => {
    expect(resolveEventInstant("2026-10-24", undefined, NOW).getTime()).toBe(NOW.getTime());
  });

  it("dia anterior, sem hora: 12:00 de Brasília", () => {
    expect(resolveEventInstant("2026-10-23", undefined, NOW).toISOString()).toBe("2026-10-23T15:00:00.000Z");
  });

  it("com hora informada: usa essa hora", () => {
    expect(resolveEventInstant("2026-10-24", "09:15", NOW).toISOString()).toBe("2026-10-24T12:15:00.000Z");
    expect(resolveEventInstant("2026-10-22", "18:40", NOW).toISOString()).toBe("2026-10-22T21:40:00.000Z");
  });

  it("recusa dia depois de hoje e hora ainda no futuro", () => {
    expect(() => resolveEventInstant("2026-10-25", undefined, NOW)).toThrow(InvalidEventDateError);
    expect(() => resolveEventInstant("2026-10-24", "13:00", NOW)).toThrow(/futuro/);
  });

  it("recusa data e hora malformadas", () => {
    expect(() => resolveEventInstant("24/10/2026", undefined, NOW)).toThrow(/inválida/);
    expect(() => resolveEventInstant("2026-10-24", "25:99", NOW)).toThrow(/inválido/);
  });

  it("às 22h de Brasília (já é dia seguinte em UTC) 'hoje' ainda é o dia de Brasília", () => {
    const night = new Date("2026-10-25T01:30:00Z"); // 22:30 de 24/10 em Brasília
    expect(resolveEventInstant("2026-10-24", undefined, night).getTime()).toBe(night.getTime());
    expect(() => resolveEventInstant("2026-10-25", undefined, night)).toThrow(InvalidEventDateError);
  });
});
