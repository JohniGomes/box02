import { listWorkOrdersByCustomer, type CustomerWorkOrderHistoryRow } from "@/lib/db/repositories/workOrders";
import { listReengagementCandidates, type ReengagementCandidateRow } from "@/lib/db/repositories/customers";
import { getReengagementThresholdDays, setReengagementThresholdDays } from "@/lib/settings/service";

/** Ciclo O — CRM Fatia 1: histórico consolidado do cliente + lembrete
 * de retorno. Sem captação de leads, sem envio automático de mensagem
 * — decisões explícitas, fora desta fatia. */
export interface CustomerHistoryView {
  workOrders: CustomerWorkOrderHistoryRow[];
  totalWorkOrders: number;
  totalSpentCents: number;
}

export async function getCustomerHistoryService(customerId: string): Promise<CustomerHistoryView> {
  const workOrders = await listWorkOrdersByCustomer(customerId);
  const delivered = workOrders.filter((wo) => wo.status === "ENTREGUE");
  const totalSpentCents = delivered.reduce((sum, wo) => sum + wo.totalCents, 0);

  return {
    workOrders,
    totalWorkOrders: workOrders.length,
    totalSpentCents,
  };
}

export interface ReengagementSummary {
  /** null quando o limite de dias ainda não foi configurado — a
   * tela deve mostrar "configure o limite", nunca uma lista calculada
   * com um número chutado. */
  thresholdDays: number | null;
  candidates: ReengagementCandidateRow[];
}

export async function listReengagementCandidatesService(): Promise<ReengagementSummary> {
  const thresholdDays = await getReengagementThresholdDays();
  if (thresholdDays === null) {
    return { thresholdDays: null, candidates: [] };
  }
  const candidates = await listReengagementCandidates(thresholdDays);
  return { thresholdDays, candidates };
}

export async function getReengagementThresholdService(): Promise<number | null> {
  return getReengagementThresholdDays();
}

export async function setReengagementThresholdService(days: number): Promise<void> {
  await setReengagementThresholdDays(days);
}
