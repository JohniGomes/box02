import { z } from "zod";
import { isPlausiblePhone, normalizePhone } from "./phone";

const optionalTrimmed = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? undefined : v))
  .optional();

export const createServiceRequestSchema = z.object({
  customerName: z.string().trim().min(2, "Informe seu nome"),
  customerPhone: z
    .string()
    .trim()
    .refine(isPlausiblePhone, "Informe um telefone válido com DDD")
    .transform(normalizePhone),
  vehicleDescription: optionalTrimmed,
  /** Placa (opcional): guardada em maiúsculas e sem traço. */
  vehiclePlate: z
    .string()
    .trim()
    .max(10, "Placa inválida")
    .transform((v) => (v.length === 0 ? undefined : v.toUpperCase().replace(/[^A-Z0-9]/g, "")))
    .optional(),
  /** Melhor dia/horário (texto livre, opcional). */
  preferredTime: z
    .string()
    .trim()
    .max(120, "Texto muito longo")
    .transform((v) => (v.length === 0 ? undefined : v))
    .optional(),
  description: z.string().trim().min(5, "Descreva o que você precisa"),
});

export type CreateServiceRequestInput = z.infer<typeof createServiceRequestSchema>;
