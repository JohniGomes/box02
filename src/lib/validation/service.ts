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
  /** Fase 2F — repetir a cada N meses e/ou N km (opcionais; vazio = sem lembrete). */
  intervalMonths: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : Number(v)))
    .pipe(z.number().int().min(1, "Use um número de meses maior que zero").max(120, "Máximo de 120 meses").optional()),
  intervalKm: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : Number(String(v).replace(/\./g, ""))))
    .pipe(z.number().int().min(1, "Use um KM maior que zero").max(500000, "Máximo de 500.000 km").optional()),
});

export type ServiceInput = z.infer<typeof serviceInputSchema>;
