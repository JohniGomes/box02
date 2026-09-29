import { z } from "zod";
import { isValidCnpj, isValidCpf, onlyDigits } from "./document";

export const quoteDecisionInputSchema = z
  .object({
    itemDecisions: z
      .array(
        z.object({
          itemId: z.string().min(1),
          decision: z.enum(["APROVADO", "RECUSADO"]),
        }),
      )
      .min(1, "Nenhum item para decidir"),
    approverName: z.string().trim().min(2, "Informe seu nome"),
    approverDocument: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v === "" ? undefined : v)),
    reason: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v === "" ? undefined : v)),
    notes: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v === "" ? undefined : v)),
    ipAddress: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // Reaproveita a mesma validação de CPF/CNPJ do cadastro de clientes
    // (Ciclo 2) — documento é opcional (K6), mas quando informado precisa
    // ser um CPF ou CNPJ válido, não qualquer texto.
    if (data.approverDocument) {
      const digits = onlyDigits(data.approverDocument);
      const validCpf = digits.length === 11 && isValidCpf(digits);
      const validCnpj = digits.length === 14 && isValidCnpj(digits);
      if (!validCpf && !validCnpj) {
        ctx.addIssue({ code: "custom", message: "CPF/CNPJ inválido", path: ["approverDocument"] });
      }
    }
  })
  .transform((data) => ({
    ...data,
    approverDocument: data.approverDocument ? onlyDigits(data.approverDocument) : undefined,
  }));

export type QuoteDecisionInput = z.infer<typeof quoteDecisionInputSchema>;
