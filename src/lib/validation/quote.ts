import { z } from "zod";

export const quoteItemInputSchema = z.object({
  type: z.enum(["SERVICO", "PECA", "MAO_DE_OBRA"]),
  description: z.string().trim().min(2, "Descreva o item"),
  quantity: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "string" ? Number(v.replace(",", ".")) : v))
    .pipe(z.number().positive("Quantidade deve ser maior que zero")),
  unitPriceReais: z
    .union([z.string(), z.number()])
    .transform((v) =>
      typeof v === "string" ? Number(v.replace(/\./g, "").replace(",", ".")) : v,
    )
    .pipe(z.number().nonnegative("Preço não pode ser negativo")),
  /// Ciclo B — origem opcional no catálogo de serviços. Só usado para
  /// preencher description/unitPriceReais no momento da criação; nunca
  /// mais lido depois disso (o item congelado é sempre a fonte).
  serviceId: z.string().trim().optional(),
  /// Ciclo C1 — obrigatório. NECESSARIO/RECOMENDADO exigem decisão do
  /// cliente e entram no total; INFORMATIVO nunca exige decisão, nunca
  /// entra no total cobrável (mesmo com valor estimado preenchido).
  category: z.enum(["NECESSARIO", "RECOMENDADO", "INFORMATIVO"], {
    message: "Selecione a categoria do item (Necessário, Recomendado ou Informativo)",
  }),
});

const adjustmentSchema = z
  .object({
    type: z.enum(["PERCENTUAL", "FIXO"]).nullable().optional(),
    value: z
      .union([z.string(), z.number()])
      .nullable()
      .optional()
      .transform((v) => {
        if (v === null || v === undefined || v === "") return null;
        const n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
        return Number.isFinite(n) ? n : null;
      }),
  })
  .optional();

export const quoteInputSchema = z.object({
  customerId: z.string().min(1, "Selecione o cliente"),
  vehicleId: z.string().min(1, "Selecione o veículo"),
  items: z.array(quoteItemInputSchema).min(1, "Adicione pelo menos um item"),
  discount: adjustmentSchema,
  surcharge: adjustmentSchema,
  validUntil: z.string().optional(), // ISO date; se ausente, usa o padrão configurado
  internalNotes: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  customerMessage: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export type QuoteInput = z.infer<typeof quoteInputSchema>;
export type QuoteItemInput = z.infer<typeof quoteItemInputSchema>;
