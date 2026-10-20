import { describe, expect, it } from "vitest";
import { addOneMonth, daysBetween, noonInBrasilia, todayInBrasilia } from "../dates";

describe("addOneMonth", () => {
  it("mantém o mesmo dia", () => {
    expect(addOneMonth("2026-11-20")).toBe("2026-12-20");
  });

  it("vira o ano", () => {
    expect(addOneMonth("2026-12-10")).toBe("2027-01-10");
  });

  it("usa o último dia quando o mês seguinte é mais curto", () => {
    expect(addOneMonth("2026-01-31")).toBe("2026-02-28");
    expect(addOneMonth("2026-01-30")).toBe("2026-02-28");
    expect(addOneMonth("2028-01-31")).toBe("2028-02-29"); // ano bissexto
    expect(addOneMonth("2026-03-31")).toBe("2026-04-30");
  });
});

describe("daysBetween", () => {
  it("conta dias inteiros, positivo para o futuro e negativo para o passado", () => {
    expect(daysBetween("2026-10-20", "2026-10-27")).toBe(7);
    expect(daysBetween("2026-10-20", "2026-10-20")).toBe(0);
    expect(daysBetween("2026-10-20", "2026-10-18")).toBe(-2);
    expect(daysBetween("2026-10-31", "2026-11-01")).toBe(1);
  });
});

describe("fuso de Brasília", () => {
  it("às 22h52 em Brasília ainda é o mesmo dia (já é o dia seguinte em UTC)", () => {
    expect(todayInBrasilia(new Date("2026-10-20T01:52:00Z"))).toBe("2026-10-19");
  });

  it("depois da meia-noite de Brasília vira o dia", () => {
    expect(todayInBrasilia(new Date("2026-10-20T03:30:00Z"))).toBe("2026-10-20");
  });

  it("meio-dia de Brasília é 15h UTC", () => {
    expect(noonInBrasilia("2026-10-19").toISOString()).toBe("2026-10-19T15:00:00.000Z");
  });
});
