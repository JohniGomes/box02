import Link from "next/link";
import { listAppointmentsWithNamesBetweenService } from "@/lib/appointments/service";
import { formatPlate } from "@/lib/validation/plate";
import { CancelAppointmentButton } from "./CancelAppointmentButton";

export default async function AppointmentsPage() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(from);
  to.setDate(to.getDate() + 60);

  const appointments = await listAppointmentsWithNamesBetweenService(from, to);

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
                  {new Date(a.scheduledAt).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {a.status === "CANCELADO" ? (
                  <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-semibold text-danger">
                    Cancelado
                  </span>
                ) : (
                  <CancelAppointmentButton appointmentId={a.id} />
                )}
              </div>
              <p className="text-sm">{a.customerName}</p>
              {a.vehiclePlate || a.vehicleDescription ? (
                <p className="text-xs text-muted">
                  {a.vehiclePlate ? formatPlate(a.vehiclePlate) : ""}
                  {a.vehicleDescription ? ` — ${a.vehicleDescription}` : ""}
                </p>
              ) : null}
              {a.description ? <p className="mt-1 text-sm text-muted">{a.description}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
