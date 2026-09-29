import { z } from "zod";
import { isValidPlate, normalizePlate } from "./plate";

const optionalTrimmed = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const currentYear = new Date().getFullYear();

const optionalYear = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === "") return undefined;
    const n = typeof v === "string" ? Number(v) : v;
    return Number.isFinite(n) ? n : undefined;
  })
  .pipe(z.number().int().min(1950).max(currentYear + 1).optional());

const optionalMileage = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === "") return undefined;
    const n = typeof v === "string" ? Number(v) : v;
    return Number.isFinite(n) ? n : undefined;
  })
  .pipe(z.number().int().min(0).max(2_000_000).optional());

export const vehicleInputSchema = z
  .object({
    customerId: z.string().min(1, "Selecione o cliente"),
    plate: optionalTrimmed,
    brand: optionalTrimmed,
    model: optionalTrimmed,
    version: optionalTrimmed,
    yearManufacture: optionalYear,
    yearModel: optionalYear,
    color: optionalTrimmed,
    fuelType: optionalTrimmed,
    mileage: optionalMileage,
    chassis: optionalTrimmed,
    renavam: optionalTrimmed,
    notes: optionalTrimmed,
  })
  .superRefine((data, ctx) => {
    if (data.plate && !isValidPlate(data.plate)) {
      ctx.addIssue({
        code: "custom",
        message: "Placa inválida (use o formato ABC1234 ou ABC1D23)",
        path: ["plate"],
      });
    }
  });

export type VehicleInput = z.infer<typeof vehicleInputSchema>;

export function normalizeVehicleInput(input: VehicleInput) {
  return {
    ...input,
    plate: input.plate ? normalizePlate(input.plate) : undefined,
  };
}
