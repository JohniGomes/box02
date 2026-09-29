import { onlyDigits } from "./document";

/**
 * Normaliza telefone/WhatsApp para somente dígitos (mantendo DDD).
 * Não valida DDD nem se o número existe de fato — apenas garante que
 * "(62) 99448-2763" e "62994482763" sejam tratados como o mesmo dado.
 */
export function normalizePhone(value: string): string {
  return onlyDigits(value);
}

/** Verifica um formato minimamente plausível: DDD (2) + número (8 ou 9 dígitos). */
export function isPlausiblePhone(value: string): boolean {
  const digits = normalizePhone(value);
  return digits.length === 10 || digits.length === 11;
}

export function formatPhone(digitsOnly: string): string {
  const d = onlyDigits(digitsOnly);
  if (d.length === 11) {
    return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  }
  if (d.length === 10) {
    return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  }
  return digitsOnly;
}

/** Link direto para WhatsApp Web/App a partir do número normalizado. */
export function whatsappLink(digitsOnly: string): string {
  const d = onlyDigits(digitsOnly);
  const withCountryCode = d.startsWith("55") ? d : `55${d}`;
  return `https://wa.me/${withCountryCode}`;
}
