import { z } from "zod";

const optionalTrimmed = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

/** Código obrigatório e único (POP-001, CHK-001...) — rastreabilidade e
 * identificação, decisão explícita do Ciclo D. Formato livre (não força
 * regex POP-\d{3}) para não travar convenções futuras da oficina. */
const codeSchema = z.string().trim().min(1, "Código obrigatório (ex.: POP-001)");

export const procedureInputSchema = z.object({
  code: codeSchema,
  title: z.string().trim().min(1, "Título obrigatório"),
  objective: optionalTrimmed,
  prerequisites: optionalTrimmed,
  steps: optionalTrimmed,
  completionCriteria: optionalTrimmed,
});

export type ProcedureInput = z.infer<typeof procedureInputSchema>;

export const checklistInputSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(1, "Nome obrigatório"),
  type: z.enum(["ENTRADA", "EXECUCAO", "ENTREGA"], {
    message: "Selecione o tipo do checklist",
  }),
});

export type ChecklistInput = z.infer<typeof checklistInputSchema>;

export const checklistItemInputSchema = z.object({
  description: z.string().trim().min(1, "Descreva o item"),
  required: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export type ChecklistItemInput = z.infer<typeof checklistItemInputSchema>;
