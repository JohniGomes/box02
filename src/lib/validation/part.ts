import { z } from "zod";
import { purchasePaymentSchema } from "./purchase";

const optionalTrimmed = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? undefined : v))
  .optional();

const optionalInt = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === "") return undefined;
    const n = typeof v === "string" ? Number(v) : v;
    return Number.isFinite(n) ? Math.round(n) : undefined;
  })
  .pipe(z.number().int().min(0).optional());

const optionalPercent = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === "") return undefined;
    const n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
    return Number.isFinite(n) ? n : undefined;
  })
  .pipe(z.number().min(0).optional());

export const createPartSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório"),
  sku: optionalTrimmed,
  unit: z.string().trim().min(1).default("un"),
  costReais: z.union([z.string(), z.number()]).optional(),
  minStock: optionalInt,
  markupPercent: optionalPercent,
  notes: optionalTrimmed,
  isConsumable: z.boolean().optional(),
});

export const updatePartSchema = createPartSchema;

/**
 * Peça comprada para um cliente (fluxo direto do orçamento/OS): nasce já com
 * custo e quantidade em estoque. O preço de venda é só outra forma de informar
 * o markup — o que fica gravado é o percentual (preço nunca é armazenado).
 */
export const createPurchasedPartSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da peça"),
  quantity: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "string" ? Number(v.replace(",", ".")) : v))
    .pipe(z.number().int("Quantidade deve ser um número inteiro").positive("Quantidade deve ser maior que zero")),
  costReais: z.union([z.string(), z.number()]),
  priceReais: z.union([z.string(), z.number()]).optional(),
  /** Como foi pago (gera a despesa junto). Ausente = não lança despesa. */
  payment: purchasePaymentSchema.optional(),
});

export const createStockMovementSchema = z.object({
  type: z.enum(["ENTRADA", "SAIDA"], { message: "Selecione o tipo de movimentação" }),
  quantity: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .pipe(z.number().int().positive("Quantidade precisa ser maior que zero")),
  reason: optionalTrimmed,
});
