import { z } from "zod";

const optionalTrimmed = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? undefined : v))
  .optional();

export const createAppointmentSchema = z.object({
  customerId: z.string().min(1, "Selecione o cliente"),
  vehicleId: optionalTrimmed,
  scheduledAt: z.string().trim().min(1, "Informe data e hora"),
  description: optionalTrimmed,
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const cancelAppointmentSchema = z.object({
  cancelReason: optionalTrimmed,
});
