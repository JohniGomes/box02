import type { VehicleRecord } from "@/lib/db/repositories/vehicles";
import { formatPlate } from "@/lib/validation/plate";

export interface VehicleFormValues {
  customerId: string;
  customerLabel: string;
  plate: string;
  brand: string;
  model: string;
  version: string;
  yearManufacture: string;
  yearModel: string;
  color: string;
  fuelType: string;
  mileage: string;
  chassis: string;
  renavam: string;
  notes: string;
}

export function emptyVehicleFormValues(preset?: { customerId?: string; customerLabel?: string }): VehicleFormValues {
  return {
    customerId: preset?.customerId ?? "",
    customerLabel: preset?.customerLabel ?? "",
    plate: "",
    brand: "",
    model: "",
    version: "",
    yearManufacture: "",
    yearModel: "",
    color: "",
    fuelType: "",
    mileage: "",
    chassis: "",
    renavam: "",
    notes: "",
  };
}

/** Transformação pura (sem estado/hook) — vive fora do "use client" de
 * propósito, pra poder ser chamada direto de Server Components
 * (páginas de edição) sem cruzar a fronteira servidor/cliente. */
export function vehicleRecordToFormValues(vehicle: VehicleRecord, customerLabel: string): VehicleFormValues {
  return {
    customerId: vehicle.customerId,
    customerLabel,
    plate: vehicle.plate ? formatPlate(vehicle.plate) : "",
    brand: vehicle.brand ?? "",
    model: vehicle.model ?? "",
    version: vehicle.version ?? "",
    yearManufacture: vehicle.yearManufacture ? String(vehicle.yearManufacture) : "",
    yearModel: vehicle.yearModel ? String(vehicle.yearModel) : "",
    color: vehicle.color ?? "",
    fuelType: vehicle.fuelType ?? "",
    mileage: vehicle.mileage !== null ? String(vehicle.mileage) : "",
    chassis: vehicle.chassis ?? "",
    renavam: vehicle.renavam ?? "",
    notes: vehicle.notes ?? "",
  };
}
