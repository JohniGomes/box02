import Link from "next/link";
import { NewWorkOrderWithoutQuoteForm } from "../NewWorkOrderWithoutQuoteForm";
import { getAppointmentForWorkOrderService } from "@/lib/appointments/service";

export default async function NewWorkOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ agendamento?: string }>;
}) {
  const { agendamento } = await searchParams;
  const appointment = agendamento ? await getAppointmentForWorkOrderService(agendamento) : null;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/os" className="text-sm text-muted underline-offset-2 hover:underline">
        ← Ordens de Serviço
      </Link>
      <h1 className="text-lg font-semibold tracking-tight">Nova OS (sem orçamento)</h1>
      {appointment ? (
        <p className="rounded-xl border border-accent/30 bg-accent/5 p-3 text-sm">
          Criando a OS a partir do agendamento de <strong>{appointment.customerName}</strong>. Ao salvar, o agendamento
          fica marcado como &quot;Compareceu&quot; e ligado à OS.
        </p>
      ) : (
        <p className="text-sm text-muted">
          Para converter um orçamento já aprovado em OS, use o botão &quot;Criar OS a partir deste
          orçamento&quot; na própria ficha do orçamento. Se o cliente aprovou fora do link, use antes
          &quot;Registrar aprovação&quot; na mesma ficha.
        </p>
      )}
      <NewWorkOrderWithoutQuoteForm
        initial={
          appointment
            ? {
                appointmentId: appointment.id,
                customer: { id: appointment.customerId, label: appointment.customerName },
                vehicleId: appointment.vehicleId ?? "",
                complaint: appointment.description ?? "",
              }
            : undefined
        }
      />
    </div>
  );
}
