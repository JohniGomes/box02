import { z } from "zod";

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
});

export const updatePartSchema = createPartSchema;

export const createStockMovementSchema = z.object({
  type: z.enum(["ENTRADA", "SAIDA"], { message: "Selecione o tipo de movimentação" }),
  quantity: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .pipe(z.number().int().positive("Quantidade precisa ser maior que zero")),
  reason: optionalTrimmed,
});
