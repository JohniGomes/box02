import { incrementCounter } from "@/lib/db/repositories/appSettings";

/**
 * Numeração da OS — sequencial CONTÍNUA (D-OS-7), diferente do orçamento
 * que é por ano. Reaproveita a MESMA função `incrementCounter` já usada
 * pela numeração do orçamento (src/lib/quotes/numbering.ts) — só muda a
 * chave (contínua, sem segmentar por ano) e o formato de exibição.
 * Nenhuma lógica de contador nova foi escrita.
 */
export async function generateWorkOrderNumber(): Promise<string> {
  const seq = await incrementCounter("work_order_number_seq");
  return `OS-${String(seq).padStart(6, "0")}`;
}
