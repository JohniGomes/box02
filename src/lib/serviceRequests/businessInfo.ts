/**
 * Horário de funcionamento mostrado na página pública de solicitação.
 * Trocar horário = editar aqui. (Valores conforme a especificação de
 * agendamento de 20/10: seg–sex 8h–18h, sáb 8h–12h, domingo fechado.)
 */
export const BUSINESS_HOURS = [
  { days: "Segunda a sexta", hours: "8h às 18h" },
  { days: "Sábado", hours: "8h às 12h" },
  { days: "Domingo", hours: "Fechado" },
] as const;
