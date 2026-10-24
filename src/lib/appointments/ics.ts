/**
 * Agenda em formato de calendário (.ics) para assinar no Google Agenda.
 * Os horários dos agendamentos são guardados "como digitados" (relógio de
 * parede, sem conversão), então saem com o fuso de Brasília marcado.
 */
export interface IcsAppointment {
  id: string;
  status: string;
  scheduledAt: Date;
  customerName: string;
  description: string | null;
  vehiclePlate: string | null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** AAAAMMDDTHHMMSS a partir do relógio de parede guardado (UTC getters). */
export function wallClockStamp(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`;
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Dobra linhas com mais de 75 caracteres, como o formato exige. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return parts.join("\r\n");
}

const STATUS_PREFIX: Record<string, string> = {
  COMPARECEU: "✔ ",
  NAO_COMPARECEU: "✖ ",
};

export function buildAppointmentsIcs(appointments: IcsAppointment[], now: Date = new Date()): string {
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BOX 02//Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:BOX 02 - Agenda",
    "X-WR-TIMEZONE:America/Sao_Paulo",
  ];
  for (const a of appointments) {
    if (a.status === "CANCELADO") continue;
    const start = a.scheduledAt;
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const title = `${STATUS_PREFIX[a.status] ?? ""}${a.customerName}${a.description ? ` - ${a.description}` : ""}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${a.id}@box02`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=America/Sao_Paulo:${wallClockStamp(start)}`,
      `DTEND;TZID=America/Sao_Paulo:${wallClockStamp(end)}`,
      fold(`SUMMARY:${escapeText(title)}`),
    );
    if (a.vehiclePlate) lines.push(fold(`DESCRIPTION:${escapeText(`Placa ${a.vehiclePlate}`)}`));
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
