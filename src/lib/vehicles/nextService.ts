/**
 * Próxima troca de cada serviço de um veículo, a partir da última vez que o serviço foi executado
 * e entregue. Funções puras: sem banco, fáceis de testar.
 */

export interface LastServiceRow {
  serviceId: string;
  serviceName: string;
  intervalMonths: number | null;
  intervalKm: number | null;
  /** Quando o serviço foi entregue pela última vez. */
  lastAt: Date;
  /** KM do veículo nessa OS (se foi anotado). */
  lastKm: number | null;
}

export type DueStatus = "VENCIDA" | "PROXIMA" | "EM_DIA";

export interface NextServiceDue {
  serviceId: string;
  serviceName: string;
  lastAt: Date;
  lastKm: number | null;
  dueAt: Date | null;
  dueKm: number | null;
  status: DueStatus;
  /** Frase curta para mostrar: "vence em 12/04/2027 ou 110.000 km". */
  dueText: string;
}

const SOON_DAYS = 30;

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

function dateBr(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** Calcula o vencimento por data e/ou KM (vale o que vencer primeiro). Sem intervalo, devolve null. */
export function computeNextDue(row: LastServiceRow, currentMileage: number | null, now: Date = new Date()): NextServiceDue | null {
  if (!row.intervalMonths && !row.intervalKm) return null;
  const dueAt = row.intervalMonths ? addMonths(row.lastAt, row.intervalMonths) : null;
  const dueKm = row.intervalKm && row.lastKm != null ? row.lastKm + row.intervalKm : null;
  if (!dueAt && !dueKm) return null; // só KM, mas a última OS não anotou o KM

  const soonMs = SOON_DAYS * 86400000;
  const soonKm = row.intervalKm ? Math.min(1000, Math.round(row.intervalKm * 0.1)) : 0;

  const overdueByDate = dueAt ? now.getTime() >= dueAt.getTime() : false;
  const overdueByKm = dueKm != null && currentMileage != null ? currentMileage >= dueKm : false;
  const soonByDate = dueAt ? dueAt.getTime() - now.getTime() <= soonMs : false;
  const soonByKm = dueKm != null && currentMileage != null ? dueKm - currentMileage <= soonKm : false;

  const status: DueStatus = overdueByDate || overdueByKm ? "VENCIDA" : soonByDate || soonByKm ? "PROXIMA" : "EM_DIA";
  const parts = [dueAt ? dateBr(dueAt) : null, dueKm != null ? `${dueKm.toLocaleString("pt-BR")} km` : null].filter(Boolean);
  return {
    serviceId: row.serviceId,
    serviceName: row.serviceName,
    lastAt: row.lastAt,
    lastKm: row.lastKm,
    dueAt,
    dueKm,
    status,
    dueText: parts.join(" ou "),
  };
}
