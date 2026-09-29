import { z } from "zod";

// ============================================================
// Ciclo M — Financeiro completo (Fatia 1): Despesas/Contas a Pagar
// ============================================================

const optionalTrimmed = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? undefined : v))
  .optional();

export const EXPENSE_CATEGORIES = [
  "ALUGUEL",
  "SALARIOS",
  "FORNECEDORES",
  "IMPOSTOS",
  "MANUTENCAO_EQUIPAMENTOS",
  "UTILIDADES",
  "MARKETING",
  "OUTROS",
] as const;

export const createExpenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES, { message: "Selecione a categoria" }),
  description: z.string().trim().min(1, "Descrição obrigatória"),
  supplierName: optionalTrimmed,
  amountReais: z.union([z.string(), z.number()]),
  dueDate: z.string().trim().min(1, "Informe o vencimento"),
  notes: optionalTrimmed,
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const updateExpenseSchema = createExpenseSchema;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export const markExpenseAsPaidSchema = z.object({
  paymentMethod: z.enum(["DINHEIRO", "PIX", "CARTAO", "OUTRO"], { message: "Selecione a forma de pagamento" }),
});
export type MarkExpenseAsPaidInput = z.infer<typeof markExpenseAsPaidSchema>;
