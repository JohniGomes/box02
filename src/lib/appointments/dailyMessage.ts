/** Mensagem pronta com a programação de um dia, para mandar aos mecânicos pelo WhatsApp. */
export interface DailyRow {
  scheduledAt: Date;
  status: string;
  customerName: string;
  description: string | null;
  vehiclePlate: string | null;
}

function hhmm(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function buildDailyMessage(label: string, dateText: string, rows: DailyRow[]): string {
  const active = rows.filter((r) => r.status !== "CANCELADO");
  const header = `*BOX 02 - Programação de ${label}* (${dateText})`;
  if (active.length === 0) return `${header}\n\nSem agendamentos.`;
  const lines = active.map((r) => {
    const parts = [hhmm(r.scheduledAt), r.customerName];
    if (r.description) parts.push(r.description);
    if (r.vehiclePlate) parts.push(r.vehiclePlate);
    return `• ${parts.join(" - ")}`;
  });
  return `${header}\n\n${lines.join("\n")}`;
}
