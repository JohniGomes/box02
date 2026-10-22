import { z } from "zod";

const optionalTrimmed = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? undefined : v))
  .optional();

const dateString = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(dateString.optional());

export const purchaseItemSchema = z
  .object({
    /** Peça que já existe no estoque… */
    partId: optionalTrimmed,
    /** …ou uma peça nova, criada junto com a compra. */
    newPartName: optionalTrimmed,
    newPartIsConsumable: z.boolean().optional(),
    /** Preço de venda sugerido da peça nova (opcional) — vira o percentual de lucro. */
    newPartPriceReais: z.union([z.string(), z.number()]).optional(),
    quantity: z
      .union([z.string(), z.number()])
      .transform((v) => (typeof v === "string" ? Number(v.replace(",", ".")) : v))
      .pipe(z.number().int("Quantidade deve ser um número inteiro").positive("Quantidade deve ser maior que zero")),
    /** Valor TOTAL pago por este item (o custo unitário é calculado). */
    totalReais: z.union([z.string(), z.number()]),
  })
  .refine((i) => Boolean(i.partId) !== Boolean(i.newPartName), {
    message: "Escolha uma peça do estoque ou informe o nome de uma peça nova",
    path: ["partId"],
  });

export const purchasePaymentSchema = z.object({
  /** PAGO = já paguei; DEPOIS = vou pagar depois (opcionalmente parcelado); NENHUM = não lançar despesa. */
  mode: z.enum(["PAGO", "DEPOIS", "NENHUM"], { message: "Escolha como foi o pagamento" }),
  method: z.enum(["DINHEIRO", "PIX", "CARTAO", "OUTRO"]).optional(),
  paidOn: optionalDate,
  dueDate: optionalDate,
  installments: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === "") return 1;
      const n = typeof v === "string" ? Number(v) : v;
      return Number.isFinite(n) ? Math.round(n) : 1;
    })
    .pipe(z.number().int().min(1, "Parcelas: mínimo 1").max(24, "Parcelas: máximo 24")),
});

export const registerPurchaseSchema = z.object({
  supplierId: optionalTrimmed,
  newSupplierName: optionalTrimmed,
  purchaseDate: dateString,
  items: z.array(purchaseItemSchema).min(1, "Adicione pelo menos um item"),
  /** Frete (positivo) ou desconto (negativo) para a conta fechar com o valor pago. */
  adjustmentReais: z.union([z.string(), z.number()]).optional(),
  notes: optionalTrimmed,
  payment: purchasePaymentSchema,
});

export type RegisterPurchaseInput = z.infer<typeof registerPurchaseSchema>;
