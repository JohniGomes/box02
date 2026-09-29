/**
 * Utilitário para campos de "só data" (ex.: validade do orçamento),
 * evitando o erro clássico de fuso horário: `new Date("2026-03-20")`
 * é interpretado como meia-noite UTC, que em America/Sao_Paulo (UTC-3)
 * corresponde a 20/03 21h do dia ANTERIOR — ao exibir de volta com
 * `toLocaleDateString`, o usuário veria 19/03 em vez de 20/03.
 *
 * Regra: sempre construir/ler esses valores em horário LOCAL, nunca via
 * `toISOString()`/parsing direto de string "YYYY-MM-DD".
 */

/** "2026-03-20" (do input type="date") -> Date à meia-noite local. */
export function fromDateOnlyLocal(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1, 0, 0, 0, 0);
}

/** Date -> "2026-03-20" em horário LOCAL (para popular input type="date"). */
export function toDateOnlyLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
