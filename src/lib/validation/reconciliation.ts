import { z } from "zod";

const isoDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD)");

export const reconciliationPeriodSchema = z
  .object({
    from: isoDate,
    to: isoDate,
  })
  .refine((data) => data.from <= data.to, { message: "Data inicial não pode ser depois da data final" });

export type ReconciliationPeriodInput = z.infer<typeof reconciliationPeriodSchema>;
