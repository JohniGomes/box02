import { formatPlate, normalizePlate } from "@/lib/validation/plate";

/** Letras e números do 10º caractere do chassi (ano do modelo), a partir de 2010. */
const VIN_YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789";

/**
 * Ano do modelo sugerido pelo 10º caractere do chassi (17 caracteres). É só uma SUGESTÃO:
 * o código se repete a cada 30 anos, então escolhemos o ano mais recente que não passe de
 * "ano que vem". Devolve null se o chassi não tiver 17 caracteres ou o código não existir.
 */
export function vinModelYear(chassis: string | null | undefined, now: Date = new Date()): number | null {
  const vin = (chassis ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (vin.length !== 17) return null;
  const index = VIN_YEAR_CODES.indexOf(vin[9]);
  if (index < 0) return null;
  let year = 2010 + index;
  while (year > now.getFullYear() + 1) year -= 30;
  return year >= 1980 ? year : null;
}

export interface VehicleSheetData {
  brand?: string;
  model?: string;
  version?: string;
  yearManufacture?: string;
  yearModel?: string;
  plate?: string;
  chassis?: string;
  /** Peça que se quer comprar (opcional). */
  part?: string;
}

/** Texto pronto para mandar ao fornecedor/balconista pedindo cotação da peça certa. */
export function buildVehicleSheetText(d: VehicleSheetData): string {
  const clean = (v?: string) => (v ?? "").trim();
  const vehicle = [clean(d.brand), clean(d.model), clean(d.version)].filter(Boolean).join(" ");
  const fab = clean(d.yearManufacture);
  const mod = clean(d.yearModel);
  const year = fab && mod && fab !== mod ? `${fab}/${mod}` : fab || mod;
  const plate = clean(d.plate) ? formatPlate(normalizePlate(d.plate as string)) : "";

  const lines = ["Olá! Preciso de cotação de peça para este veículo:"];
  if (vehicle) lines.push(`Veículo: ${vehicle}`);
  if (year) lines.push(`Ano: ${year}`);
  if (plate) lines.push(`Placa: ${plate}`);
  if (clean(d.chassis)) lines.push(`Chassi: ${clean(d.chassis).toUpperCase()}`);
  if (clean(d.part)) lines.push(`Peça: ${clean(d.part)}`);
  lines.push("Pode me passar o valor e o prazo? Obrigado!");
  return lines.join("\n");
}
