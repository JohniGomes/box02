/**
 * Datas e horas no horário de Brasília.
 *
 * O banco guarda os instantes em UTC e o servidor (Vercel) também roda em UTC.
 * `toLocaleString` sem fuso mostra o relógio do servidor — 3 horas à frente — e
 * depois das 21h de Brasília até muda o dia. Por isso toda exibição de data/hora
 * de um instante real passa por aqui, sempre com o fuso explícito.
 *
 * ATENÇÃO: o horário dos AGENDAMENTOS é guardado "como foi digitado" (sem fuso)
 * e por isso NÃO deve passar por estas funções.
 */

export const TZ_BRASILIA = "America/Sao_Paulo";

type DateInput = Date | string | number;

/** 24/10/2026 */
export function formatDateBR(value: DateInput): string {
  return new Date(value).toLocaleDateString("pt-BR", { timeZone: TZ_BRASILIA });
}

/** 24/10/2026, 12:35:10 */
export function formatDateTimeBR(value: DateInput): string {
  return new Date(value).toLocaleString("pt-BR", { timeZone: TZ_BRASILIA });
}

/** 12:35 */
export function formatTimeBR(value: DateInput): string {
  return new Date(value).toLocaleTimeString("pt-BR", { timeZone: TZ_BRASILIA, hour: "2-digit", minute: "2-digit" });
}

/** "Hoje" em Brasília no formato AAAA-MM-DD. */
export function todayBR(now: Date = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: TZ_BRASILIA });
}

export class InvalidEventDateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEventDateError";
  }
}

/**
 * Instante de um evento informado como data (e, opcionalmente, hora) de Brasília.
 *
 * - Data de HOJE sem hora: usa o instante atual (nunca um horário fixo no futuro).
 * - Data anterior sem hora: 12:00 de Brasília.
 * - Com hora informada: usa essa hora, e ela não pode estar no futuro.
 * - Data depois de hoje: recusa.
 *
 * `now` existe para teste.
 */
export function resolveEventInstant(
  dateYmd: string,
  timeHm?: string | null,
  now: Date = new Date(),
): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) throw new InvalidEventDateError("Data inválida.");
  const today = todayBR(now);
  if (dateYmd > today) throw new InvalidEventDateError("A data não pode ser no futuro.");

  const hm = (timeHm ?? "").trim();
  if (hm) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hm)) throw new InvalidEventDateError("Horário inválido (use HH:MM).");
    const instant = new Date(`${dateYmd}T${hm}:00-03:00`);
    if (Number.isNaN(instant.getTime())) throw new InvalidEventDateError("Data ou horário inválido.");
    if (instant.getTime() > now.getTime()) throw new InvalidEventDateError("O horário não pode ser no futuro.");
    return instant;
  }

  if (dateYmd === today) return now;

  const noon = new Date(`${dateYmd}T12:00:00-03:00`);
  if (Number.isNaN(noon.getTime())) throw new InvalidEventDateError("Data inválida.");
  return noon;
}
