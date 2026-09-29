import { describe, expect, it } from "vitest";
import { formatDocument, isValidCnpj, isValidCpf, onlyDigits } from "../document";
import { formatPhone, isPlausiblePhone, normalizePhone, whatsappLink } from "../phone";
import { customerInputSchema, normalizeCustomerInput } from "../customer";

describe("CPF", () => {
  it("aceita um CPF válido conhecido", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
  });

  it("rejeita CPF com dígito verificador errado", () => {
    expect(isValidCpf("529.982.247-26")).toBe(false);
  });

  it("rejeita CPF com todos os dígitos iguais", () => {
    expect(isValidCpf("111.111.111-11")).toBe(false);
  });

  it("rejeita CPF com tamanho errado", () => {
    expect(isValidCpf("123")).toBe(false);
  });
});

describe("CNPJ", () => {
  it("aceita um CNPJ válido conhecido", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
  });

  it("rejeita CNPJ com dígito verificador errado", () => {
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
  });

  it("rejeita CNPJ com todos os dígitos iguais", () => {
    expect(isValidCnpj("11.111.111/1111-11")).toBe(false);
  });
});

describe("normalização e formatação de documento", () => {
  it("onlyDigits remove tudo que não é número", () => {
    expect(onlyDigits("529.982.247-25")).toBe("52998224725");
  });

  it("formatDocument formata CPF (11 dígitos)", () => {
    expect(formatDocument("52998224725")).toBe("529.982.247-25");
  });

  it("formatDocument formata CNPJ (14 dígitos)", () => {
    expect(formatDocument("11222333000181")).toBe("11.222.333/0001-81");
  });
});

describe("telefone", () => {
  it("normaliza formatos diferentes para o mesmo valor", () => {
    expect(normalizePhone("(62) 99448-2763")).toBe(normalizePhone("62994482763"));
  });

  it("considera plausível um número com DDD + 9 dígitos", () => {
    expect(isPlausiblePhone("62994482763")).toBe(true);
  });

  it("rejeita número muito curto", () => {
    expect(isPlausiblePhone("123")).toBe(false);
  });

  it("formatPhone formata celular com 11 dígitos", () => {
    expect(formatPhone("62994482763")).toBe("(62) 99448-2763");
  });

  it("whatsappLink adiciona código do país quando ausente", () => {
    expect(whatsappLink("62994482763")).toBe("https://wa.me/5562994482763");
  });

  it("whatsappLink não duplica código do país já presente", () => {
    expect(whatsappLink("5562994482763")).toBe("https://wa.me/5562994482763");
  });
});

describe("schema de cliente (zod)", () => {
  it("aceita PF válida sem documento", () => {
    const result = customerInputSchema.safeParse({
      type: "PF",
      legalName: "João da Silva",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita PF com CPF inválido", () => {
    const result = customerInputSchema.safeParse({
      type: "PF",
      legalName: "João da Silva",
      document: "111.111.111-11",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita PJ com CNPJ inválido", () => {
    const result = customerInputSchema.safeParse({
      type: "PJ",
      legalName: "Auto Peças LTDA",
      document: "00.000.000/0000-00",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita nome muito curto", () => {
    const result = customerInputSchema.safeParse({ type: "PF", legalName: "Jo" });
    expect(result.success).toBe(false);
  });

  it("rejeita e-mail mal formado quando informado", () => {
    const result = customerInputSchema.safeParse({
      type: "PF",
      legalName: "João da Silva",
      email: "nao-e-email",
    });
    expect(result.success).toBe(false);
  });

  it("normalizeCustomerInput deixa documento e telefones só com dígitos", () => {
    const parsed = customerInputSchema.parse({
      type: "PF",
      legalName: "João da Silva",
      document: "529.982.247-25",
      phone: "(62) 99448-2763",
    });
    const normalized = normalizeCustomerInput(parsed);
    expect(normalized.document).toBe("52998224725");
    expect(normalized.phone).toBe("62994482763");
  });
});
