import type { PartRecord } from "@/lib/db/repositories/parts";
import { centsToReais } from "@/lib/money";

export interface PartFormValues {
  name: string;
  sku: string;
  unit: string;
  costReais: string;
  minStock: string;
  markupPercent: string;
  notes: string;
}

/** Transformação pura — vive fora do "use client" de propósito, pra
 * poder ser chamada direto de Server Components (página de edição)
 * sem cruzar a fronteira servidor/cliente. */
export function partRecordToFormValues(part: PartRecord): PartFormValues {
  return {
    name: part.name,
    sku: part.sku ?? "",
    unit: part.unit,
    costReais: part.costCents !== null ? centsToReais(part.costCents) : "",
    minStock: part.minStock !== null ? String(part.minStock) : "",
    markupPercent: part.markupPercent !== null ? String(part.markupPercent) : "",
    notes: part.notes ?? "",
  };
}
