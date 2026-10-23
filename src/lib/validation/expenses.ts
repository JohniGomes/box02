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

/** Nome da categoria — usado como descrição quando ela não é informada. */
export const EXPENSE_CATEGORY_DEFAULT_DESCRIPTION: Record<(typeof EXPENSE_CATEGORIES)[number], string> = {
  ALUGUEL: "Aluguel",
  SALARIOS: "Salários/Pró-labore",
  FORNECEDORES: "Fornecedores/Peças",
  IMPOSTOS: "Impostos",
  MANUTENCAO_EQUIPAMENTOS: "Manutenção de equipamentos",
  UTILIDADES: "Utilidades",
  MARKETING: "Marketing",
  OUTROS: "Outros",
};

export const createExpenseSchema = z
  .object({
  category: z.enum(EXPENSE_CATEGORIES, { message: "Selecione a categoria" }),
  /** Opcional: vazio vira o nome da categoria. */
  description: z.string().trim().optional(),
  supplierName: optionalTrimmed,
  amountReais: z.union([z.string(), z.number()]),
  dueDate: z.string().trim().min(1, "Informe o vencimento"),
  notes: optionalTrimmed,
  /** OS relacionada (opcional). */
  workOrderId: optionalTrimmed,
  })
  .transform((data) => ({
    ...data,
    description: data.description || EXPENSE_CATEGORY_DEFAULT_DESCRIPTION[data.category],
  }));
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const updateExpenseSchema = createExpenseSchema;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export const markExpenseAsPaidSchema = z.object({
  paymentMethod: z.enum(["DINHEIRO", "PIX", "CARTAO", "OUTRO"], { message: "Selecione a forma de pagamento" }),
  /** Data em que foi paga (AAAA-MM-DD). Vazio = hoje. */
  paidOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data do pagamento inválida")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type MarkExpenseAsPaidInput = z.infer<typeof markExpenseAsPaidSchema>;
