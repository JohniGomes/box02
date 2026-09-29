import { z } from "zod";

const optionalTrimmed = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

export const serviceInputSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório"),
  category: optionalTrimmed,
  defaultPriceReais: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
  /** Ciclo H — custo interno, mesmo padrão de defaultPriceReais. Nunca
   * inferido de outro campo, sempre opcional. */
  costReais: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
});

export type ServiceInput = z.infer<typeof serviceInputSchema>;
