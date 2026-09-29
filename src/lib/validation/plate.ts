/** Remove hífen, espaços e força maiúsculas: "abc-1234" -> "ABC1234". */
export function normalizePlate(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const OLD_FORMAT = /^[A-Z]{3}[0-9]{4}$/; // ABC1234
const MERCOSUL_FORMAT = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/; // ABC1D23

/** Aceita os dois formatos de placa brasileira (antigo e Mercosul). */
export function isValidPlate(value: string): boolean {
  const plate = normalizePlate(value);
  return OLD_FORMAT.test(plate) || MERCOSUL_FORMAT.test(plate);
}

/** Formata para exibição com hífen no padrão antigo: ABC-1234. Mercosul não leva hífen. */
export function formatPlate(normalized: string): string {
  const p = normalizePlate(normalized);
  if (OLD_FORMAT.test(p)) {
    return p.replace(/^([A-Z]{3})([0-9]{4})$/, "$1-$2");
  }
  return p;
}
