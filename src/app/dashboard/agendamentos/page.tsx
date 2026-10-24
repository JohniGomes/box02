import Link from "next/link";
import { listAppointmentsWithNamesBetweenService } from "@/lib/appointments/service";
import { buildDailyMessage } from "@/lib/appointments/dailyMessage";
import { formatPlate } from "@/lib/validation/plate";
import { CancelAppointmentButton } from "./CancelAppointmentButton";
import { AppointmentActions } from "./AppointmentActions";
import { LinkWorkOrder } from "./LinkWorkOrder";

const DAY_MS = 86400000;

/** Os agendamentos são guardados como digitados (relógio de parede, lido em UTC). */
function wallDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function wallDateTimeInput(d: Date): string {
  return d.toISOString().slice(0, 16);
}

export default async function AppointmentsPage() {
  // "Hoje" no horário de Brasília, comparado com o relógio de parede guardado.
  const todayBr = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const todayStart = new Date(`${todayBr}T00:00:00.000Z`);
  const tomorrowStart = new Date(todayStart.getTime() + DAY_MS);
  const dayAfterStart = new Date(todayStart.getTime() + 2 * DAY_MS);
  const to = new Date(todayStart.getTime() + 60 * DAY_MS);

  const appointments = await listAppointmentsWithNamesBetweenService(todayStart, to);

  const todayRows = appointments.filter((a) => a.scheduledAt >= todayStart && a.scheduledAt < tomorrowStart);
  const tomorrowRows = appointments.filter((a) => a.scheduledAt >= tomorrowStart && a.scheduledAt < dayAfterStart);
  const fmt = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");
  const messages = [
    { label: "hoje", text: buildDailyMessage("hoje", fmt(todayStart), todayRows), count: todayRows.filter((a) => a.status !== "CANCELADO").length },
    { label: "amanhã", text: buildDailyMessage("amanhã", fmt(tomorrowStart), tomorrowRows), count: tomorrowRows.filter((a) => a.status !== "CANCELADO").length },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Agenda</h1>
        <Link
          href="/dashboard/agendamentos/novo"
          className="flex h-9 items-center rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground"
        >
          + Novo agendamento
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="mb-2 text-sm font-semibold">Programação para os mecânicos</p>
        <div className="flex flex-col gap-2">
          {messages.map((m) => (
            <div key={m.label} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background p-3">
              <span className="text-sm">
                {m.label === "hoje" ? "Hoje" : "Amanhã"} · {m.count} {m.count === 1 ? "agendamento" : "agendamentos"}
              </span>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(m.text)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center rounded-lg bg-accent px-3 text-xs font-semibold text-accent-foreground"
              >
                Enviar no WhatsApp
              </a>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          Abre o WhatsApp com a lista pronta; escolha o mecânico ou o grupo e toque em enviar.{" "}
          <Link href="/dashboard/configuracoes/agenda" className="font-medium text-accent">
            Agenda no Google Agenda →
          </Link>
        </p>
      </div>

      <p className="text-sm text-muted">Próximos 60 dias.</p>

      {appointments.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-5 text-center text-sm text-muted">
          Nenhum agendamento nos próximos 60 dias.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {appointments.map((a) => (
            <li key={a.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">
                  {wallDate(a.scheduledAt).split("-").reverse().slice(0, 2).join("/")} {wallDateTimeInput(a.scheduledAt).slice(11)}
                </span>
                {a.status === "CANCELADO" ? (
                  <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-semibold text-danger">
                    Cancelado
                  </span>
                ) : a.status === "AGENDADO" ? (
                  <CancelAppointmentButton appointmentId={a.id} />
                ) : null}
              </div>
              <p className="text-sm">{a.customerName}</p>
              {a.vehiclePlate || a.vehicleDescription ? (
                <p className="text-xs text-muted">
                  {a.vehiclePlate ? formatPlate(a.vehiclePlate) : ""}
                  {a.vehicleDescription ? ` — ${a.vehicleDescription}` : ""}
                </p>
              ) : null}
              {a.description ? <p className="mt-1 text-sm text-muted">{a.description}</p> : null}
              {a.workOrderId ? (
                <p className="mt-1 text-xs">
                  OS:{" "}
                  <Link href={`/dashboard/os/${a.workOrderId}`} className="font-mono font-semibold text-accent">
                    {a.workOrderNumber}
                  </Link>
                </p>
              ) : a.status !== "CANCELADO" ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <LinkWorkOrder appointmentId={a.id} />
                  {a.status === "COMPARECEU" && wallDate(a.scheduledAt) < todayBr ? null : (
                  <Link
                    href={`/dashboard/os/novo?agendamento=${a.id}`}
                    className="inline-flex h-8 items-center rounded-lg border border-accent px-3 text-xs font-semibold text-accent"
                  >
                    Criar OS
                  </Link>
                  )}
                  {a.vehicleId && !(a.status === "COMPARECEU" && wallDate(a.scheduledAt) < todayBr) ? (
                    <Link
                      href={`/dashboard/orcamentos/novo?agendamento=${a.id}`}
                      className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-semibold"
                    >
                      Criar orçamento
                    </Link>
                  ) : null}
                </div>
              ) : null}
              {a.status !== "CANCELADO" ? (
                <AppointmentActions
                  appointmentId={a.id}
                  status={a.status}
                  initialDateTime={wallDateTimeInput(a.scheduledAt)}
                  initialDescription={a.description ?? ""}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
