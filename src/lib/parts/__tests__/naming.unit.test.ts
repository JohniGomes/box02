import { describe, expect, it } from "vitest";
import { customerFacingPartName } from "../naming";

describe("customerFacingPartName", () => {
  it("usa o nome para o cliente quando existe", () => {
    expect(
      customerFacingPartName({ name: "Vela de ignição BKR6ED (Fiat Palio, Idea, Doblo)", customerName: "Velas de ignição" }),
    ).toBe("Velas de ignição");
  });

  it("sem nome para o cliente (nulo, vazio ou só espaços) usa o nome técnico", () => {
    const name = "FILTRO AR EDL-109/LX3115";
    expect(customerFacingPartName({ name })).toBe(name);
    expect(customerFacingPartName({ name, customerName: null })).toBe(name);
    expect(customerFacingPartName({ name, customerName: "   " })).toBe(name);
  });
});
