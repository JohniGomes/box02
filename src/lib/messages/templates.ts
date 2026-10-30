/** Textos das mensagens prontas. Quem envia só confere e toca em enviar. */

const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Os agendamentos guardam a hora "como digitada": ler com getters UTC. */
export function appointmentWhen(scheduledAt: Date): { day: string; time: string; weekday: string } {
  return {
    day: `${pad(scheduledAt.getUTCDate())}/${pad(scheduledAt.getUTCMonth() + 1)}`,
    time: `${pad(scheduledAt.getUTCHours())}:${pad(scheduledAt.getUTCMinutes())}`,
    weekday: WEEKDAYS[scheduledAt.getUTCDay()],
  };
}

/** " para o Fiat Celta" — para falar do horário. */
function forCar(vehicle: string | null): string {
  return vehicle ? ` para o ${vehicle}` : "";
}

/** " no seu Fiat Celta" — para falar de um serviço já feito. */
function onCar(vehicle: string | null): string {
  return vehicle ? ` no seu ${vehicle}` : "";
}

export function confirmationMessage(a: { customerName: string; scheduledAt: Date; vehicleDescription: string | null; description: string | null }): string {
  const w = appointmentWhen(a.scheduledAt);
  return (
    `Olá, ${firstName(a.customerName)}! Aqui é da BOX 02. Seu horário${forCar(a.vehicleDescription)} está confirmado para ` +
    `${w.weekday}, ${w.day}, às ${w.time}.${a.description ? ` Serviço: ${a.description}.` : ""} ` +
    `Se tiver qualquer imprevisto, é só avisar por aqui. Até lá!`
  );
}

export function reminderMessage(a: { customerName: string; scheduledAt: Date; vehicleDescription: string | null }, when: "hoje" | "amanhã"): string {
  const w = appointmentWhen(a.scheduledAt);
  return (
    `Olá, ${firstName(a.customerName)}! Aqui é da BOX 02. Passando para lembrar do seu horário${forCar(a.vehicleDescription)} ` +
    `${when}, às ${w.time}. Está tudo certo para você vir? Se precisar remarcar, é só avisar. Obrigado!`
  );
}

export function reviewMessage(r: { customerName: string; vehicleDescription: string | null }, link: string): string {
  return (
    `Olá, ${firstName(r.customerName)}! Aqui é da BOX 02. Obrigado por confiar no nosso trabalho${onCar(r.vehicleDescription)}. ` +
    `Se você ficou satisfeito, sua avaliação no Google ajuda muito uma oficina nova como a nossa: ${link} ` +
    `Leva menos de 1 minuto. Qualquer dúvida sobre o serviço, é só chamar aqui. Abraço!`
  );
}

export function balanceMessage(r: { customerName: string; number: string; vehicleDescription: string | null }, balanceText: string): string {
  return (
    `Olá, ${firstName(r.customerName)}! Aqui é da BOX 02. Passando para lembrar que ficou um saldo de ${balanceText} ` +
    `do serviço realizado${onCar(r.vehicleDescription)} (OS ${r.number}). Quando puder, é só nos avisar por aqui para combinarmos o pagamento. ` +
    `Obrigado!`
  );
}

/** Pede permissão antes de mandar lembretes de revisão. */
export function permissionMessage(r: { customerName: string }): string {
  return (
    `Olá, ${firstName(r.customerName)}! Aqui é da BOX 02. Posso te avisar quando estiver chegando a hora de trocar óleo, ` +
    `filtros e outras revisões do seu carro? Se preferir não receber, é só me falar. Obrigado!`
  );
}

export function serviceDueMessage(
  r: { customerName: string; vehicleDescription: string | null; serviceName: string; lastDate: string; overdue: boolean },
): string {
  const vehicle = r.vehicleDescription ? ` do seu ${r.vehicleDescription}` : "";
  const when = r.overdue ? "já passou da hora" : "está chegando a hora";
  return (
    `Olá, ${firstName(r.customerName)}! Aqui é da BOX 02. Passando para lembrar que ${when} da ${r.serviceName.toLowerCase()}${vehicle} ` +
    `(a última foi em ${r.lastDate}). Quer que a gente já agende um horário? Abraço!`
  );
}
