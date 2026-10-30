/** Mês no formato "AAAA-MM". Funções puras para o seletor da aba Financeiro. */

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function currentMonthBr(now: Date = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
}

/** Aceita só "AAAA-MM" válido; qualquer outra coisa vira o mês atual. */
export function parseMonth(value: string | undefined, now: Date = new Date()): string {
  return value && MONTH_RE.test(value) ? value : currentMonthBr(now);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${NAMES[m - 1]} de ${y}`;
}

/** Diferença percentual contra o mês anterior; null quando não há base (anterior = 0). */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}
