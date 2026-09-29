import type { WorkOrderStatus } from "@/lib/db/repositories/workOrders";

export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  ABERTA: "Aberta",
  EM_DIAGNOSTICO: "Em diagnóstico",
  EM_EXECUCAO: "Em execução",
  AGUARDANDO_PECA: "Aguardando peça",
  TESTE_FINAL: "Teste final",
  PRONTA: "Pronta",
  ENTREGUE: "Entregue",
  CANCELADA: "Cancelada",
};

export const WORK_ORDER_STATUS_CLASS: Record<WorkOrderStatus, string> = {
  ABERTA: "bg-muted/20 text-muted",
  EM_DIAGNOSTICO: "bg-accent/15 text-foreground",
  EM_EXECUCAO: "bg-accent/15 text-foreground",
  AGUARDANDO_PECA: "bg-danger/15 text-danger",
  TESTE_FINAL: "bg-accent/15 text-foreground",
  PRONTA: "bg-success/15 text-success",
  ENTREGUE: "bg-success/15 text-success",
  CANCELADA: "bg-muted/20 text-muted",
};

/**
 * Mapeamento operacional status → etapa ativa do Método BOX 02.
 *
 * IMPORTANTE (decisão registrada, não reabrir sem aprovação explícita):
 * status e etapa do Método NÃO são sinônimos. Este mapeamento só cobre
 * as 4 etapas que têm correspondência direta com o status da OS
 * (Identificamos/Diagnosticamos/Executamos/Entregamos) — Registramos,
 * Explicamos e Orçamos NUNCA "acendem" por causa de status; são
 * mostradas sempre com o que já existe (ou "não aplicável"),
 * independente de qual status a OS está.
 *
 * PRONTA mapeia para EXECUTAMOS (não existe "Verificamos" como etapa
 * ativa) — o selo/barreira "Verificando" é um marcador visual à parte,
 * nunca um 8º item na sequência.
 *
 * CANCELADA -> null (nenhuma etapa ativa, fora do stepper).
 */
export type MethodStage =
  | "IDENTIFICAMOS"
  | "DIAGNOSTICAMOS"
  | "REGISTRAMOS"
  | "EXPLICAMOS"
  | "ORCAMOS"
  | "EXECUTAMOS"
  | "ENTREGAMOS";

export const METHOD_STAGES: MethodStage[] = [
  "IDENTIFICAMOS",
  "DIAGNOSTICAMOS",
  "REGISTRAMOS",
  "EXPLICAMOS",
  "ORCAMOS",
  "EXECUTAMOS",
  "ENTREGAMOS",
];

export const METHOD_STAGE_LABEL: Record<MethodStage, string> = {
  IDENTIFICAMOS: "Identificamos",
  DIAGNOSTICAMOS: "Diagnosticamos",
  REGISTRAMOS: "Registramos",
  EXPLICAMOS: "Explicamos",
  ORCAMOS: "Orçamos",
  EXECUTAMOS: "Executamos",
  ENTREGAMOS: "Entregamos",
};

export function workOrderStatusToActiveMethodStage(status: WorkOrderStatus): MethodStage | null {
  switch (status) {
    case "ABERTA":
      return "IDENTIFICAMOS";
    case "EM_DIAGNOSTICO":
      return "DIAGNOSTICAMOS";
    case "EM_EXECUCAO":
    case "AGUARDANDO_PECA":
    case "TESTE_FINAL":
    case "PRONTA":
      return "EXECUTAMOS";
    case "ENTREGUE":
      return "ENTREGAMOS";
    case "CANCELADA":
      return null;
  }
}

/** true só quando status = PRONTA — mostra o selo/barreira
 * "Verificando" colado entre Executamos e Entregamos. Nunca é uma
 * etapa própria do stepper. */
export function isAtVerificamosBarrier(status: WorkOrderStatus): boolean {
  return status === "PRONTA";
}
