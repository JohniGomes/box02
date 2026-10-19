/**
 * Equipe operacional que recebe o aviso de nova solicitação. Sem API do
 * WhatsApp (decisão explícita — ver conversa com a cliente): o sistema
 * só gera o link com a mensagem pronta; alguém ainda precisa abrir e
 * apertar enviar. Trocar número = editar aqui.
 */
export const SERVICE_REQUEST_NOTIFY_TEAM = [
  { name: "Carlos", phone: "5562994493815" },
  { name: "Matheus", phone: "5562992282536" },
] as const;
