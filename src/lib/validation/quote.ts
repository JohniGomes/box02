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
    .transform((v) => {
      if (typeof v !== "string") return v;
      // Mesma regra de `reaisToCents` (src/lib/money): "." só é separador de
      // milhar quando há vírgula decimal ("1.234,56"). Sem vírgula, "." é o
      // decimal ("47.12") — antes virava 4712 reais, 100x o valor da tela.
      const normalized = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
      return Number(normalized);
    })
    .pipe(z.number().nonnegative("Preço não pode ser negativo")),
  /// Ciclo B — origem opcional no catálogo de serviços. Só usado para
  /// preencher description/unitPriceReais no momento da criação; nunca
  /// mais lido depois disso (o item congelado é sempre a fonte).
  serviceId: z.string().trim().optional(),
  /// Ciclo H — mesma lógica do serviceId, mas para peça do estoque: só
  /// usado para preencher description/unitPriceReais no momento da
  /// criação (preço sugerido = custo + markup); nunca revalidado depois.
  partId: z.string().trim().optional(),
  /// Observações livres do item (ex.: discriminar o que foi feito na mão
  /// de obra). Vazio vira undefined.
  notes: z
    .string()
    .trim()
    .max(2000, "Observações do item aceitam até 2000 caracteres")
    .optional()
    .transform((v) => (v ? v : undefined)),
  /// Ciclo C1 — obrigatório. NECESSARIO/RECOMENDADO exigem decisão do
  /// cliente e entram no total; INFORMATIVO nunca exige decisão, nunca
  /// entra no total cobrável (mesmo com valor estimado preenchido).
  category: z.enum(["NECESSARIO", "RECOMENDADO", "INFORMATIVO"], {
    message: "Selecione a categoria do item (Necessário, Recomendado ou Informativo)",
  }),
  /// Peça fornecida pelo cliente: o servidor zera o valor e a OS não dá baixa de estoque.
  customerSupplied: z.boolean().optional(),
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
    /// Motivo (interno) — usado só no desconto.
    reason: z
      .string()
      .trim()
      .max(500, "Motivo aceita até 500 caracteres")
      .optional()
      .transform((v) => (v ? v : undefined)),
  })
  .optional();

/** Queixa e KM do painel: opcionais no orçamento (valem para a OS). */
export const quoteCheckInSchema = z.object({
  customerComplaint: z
    .string()
    .trim()
    .max(2000, "A queixa aceita até 2000 caracteres")
    .optional()
    .transform((v) => (v ? v : undefined)),
  mileageAtEntry: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === undefined || (typeof v === "string" && v.trim() === "") ? undefined : Number(v)))
    .pipe(z.number().int().min(0, "Quilometragem inválida").max(2_000_000, "Quilometragem inválida").optional()),
});

export const quoteInputSchema = z.object({
  customerId: z.string().min(1, "Selecione o cliente"),
  vehicleId: z.string().min(1, "Selecione o veículo"),
  customerComplaint: quoteCheckInSchema.shape.customerComplaint,
  mileageAtEntry: quoteCheckInSchema.shape.mileageAtEntry,
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
