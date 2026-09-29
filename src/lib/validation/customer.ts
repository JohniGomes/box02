import { z } from "zod";
import { isValidCnpj, isValidCpf, onlyDigits } from "./document";
import { isPlausiblePhone, normalizePhone } from "./phone";

const optionalTrimmed = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const addressSchema = z.object({
  addressStreet: optionalTrimmed,
  addressNumber: optionalTrimmed,
  addressComplement: optionalTrimmed,
  addressNeighborhood: optionalTrimmed,
  addressCity: optionalTrimmed,
  addressState: optionalTrimmed.pipe(
    z
      .string()
      .length(2, "UF deve ter 2 letras")
      .optional(),
  ),
  addressZipCode: optionalTrimmed,
});

const baseContactSchema = z.object({
  phone: optionalTrimmed,
  whatsapp: optionalTrimmed,
  email: optionalTrimmed,
  notes: optionalTrimmed,
});

/** Schema para cliente Pessoa Física. */
export const pfCustomerSchema = z
  .object({
    type: z.literal("PF"),
    legalName: z.string().trim().min(3, "Informe o nome completo"),
    document: optionalTrimmed,
  })
  .merge(baseContactSchema)
  .merge(addressSchema)
  .superRefine((data, ctx) => {
    if (data.document && !isValidCpf(data.document)) {
      ctx.addIssue({ code: "custom", message: "CPF inválido", path: ["document"] });
    }
    if (data.email && !z.string().email().safeParse(data.email).success) {
      ctx.addIssue({ code: "custom", message: "E-mail inválido", path: ["email"] });
    }
    if (data.phone && !isPlausiblePhone(data.phone)) {
      ctx.addIssue({ code: "custom", message: "Telefone inválido", path: ["phone"] });
    }
    if (data.whatsapp && !isPlausiblePhone(data.whatsapp)) {
      ctx.addIssue({ code: "custom", message: "WhatsApp inválido", path: ["whatsapp"] });
    }
  });

/** Schema para cliente Pessoa Jurídica. */
export const pjCustomerSchema = z
  .object({
    type: z.literal("PJ"),
    legalName: z.string().trim().min(3, "Informe a razão social"),
    tradeName: optionalTrimmed,
    contactName: optionalTrimmed,
    document: optionalTrimmed,
  })
  .merge(baseContactSchema)
  .merge(addressSchema)
  .superRefine((data, ctx) => {
    if (data.document && !isValidCnpj(data.document)) {
      ctx.addIssue({ code: "custom", message: "CNPJ inválido", path: ["document"] });
    }
    if (data.email && !z.string().email().safeParse(data.email).success) {
      ctx.addIssue({ code: "custom", message: "E-mail inválido", path: ["email"] });
    }
    if (data.phone && !isPlausiblePhone(data.phone)) {
      ctx.addIssue({ code: "custom", message: "Telefone inválido", path: ["phone"] });
    }
    if (data.whatsapp && !isPlausiblePhone(data.whatsapp)) {
      ctx.addIssue({ code: "custom", message: "WhatsApp inválido", path: ["whatsapp"] });
    }
  });

export const customerInputSchema = z.discriminatedUnion("type", [
  pfCustomerSchema,
  pjCustomerSchema,
]);

export type CustomerInput = z.infer<typeof customerInputSchema>;

/**
 * Normaliza os campos de um input já validado (documento e telefones
 * viram somente-dígitos) antes de persistir no banco.
 */
export function normalizeCustomerInput(input: CustomerInput) {
  return {
    ...input,
    document: input.document ? onlyDigits(input.document) : undefined,
    phone: input.phone ? normalizePhone(input.phone) : undefined,
    whatsapp: input.whatsapp ? normalizePhone(input.whatsapp) : undefined,
  };
}
