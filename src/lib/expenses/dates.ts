/**
 * Datas de despesa. `dueDate` é uma coluna DATE ("YYYY-MM-DD", sem hora), então
 * as contas aqui são feitas só com texto/inteiros — sem passar por Date/fuso,
 * para o vencimento nunca "andar um dia".
 */

const TZ_BR = "America/Sao_Paulo";

/** "Hoje" no horário de Brasília, no formato YYYY-MM-DD. */
export function todayInBrasilia(now: Date = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: TZ_BR });
}

/** Dias inteiros de `from` até `to` (negativo = `to` já passou). */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/**
 * Mesmo dia no mês seguinte; se o mês seguinte for mais curto, usa o último
 * dia dele (31/01 -> 28/02, 30/01 -> 28/02, 31/03 -> 30/04).
 */
export function addOneMonth(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const lastDay = new Date(Date.UTC(nextY, nextM, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${String(nextY).padStart(4, "0")}-${String(nextM).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Meio-dia de Brasília na data informada — evita virar o dia por causa do fuso. */
export function noonInBrasilia(date: string): Date {
  return new Date(`${date}T12:00:00-03:00`);
}
