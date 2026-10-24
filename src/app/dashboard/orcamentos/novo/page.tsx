import Link from "next/link";
import { QuoteForm } from "../QuoteForm";
import { getAppointmentForWorkOrderService } from "@/lib/appointments/service";
import { getVehicleService } from "@/lib/vehicles/service";
import { formatPlate } from "@/lib/validation/plate";

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ agendamento?: string }>;
}) {
  const { agendamento } = await searchParams;
  const appointment = agendamento ? await getAppointmentForWorkOrderService(agendamento) : null;
  const vehicle = appointment?.vehicleId ? await getVehicleService(appointment.vehicleId) : null;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/orcamentos" className="text-sm text-muted underline-offset-2 hover:underline">
        ← Orçamentos
      </Link>
      <h1 className="text-lg font-semibold tracking-tight">Novo orçamento</h1>
      {appointment && vehicle ? (
        <>
          <p className="rounded-xl border border-accent/30 bg-accent/5 p-3 text-sm">
            Orçamento a partir do agendamento de <strong>{appointment.customerName}</strong>: cliente, veículo e queixa já
            vêm preenchidos.
          </p>
          <QuoteForm
            mode="create"
            initialValues={{
              customer: { id: appointment.customerId, label: appointment.customerName },
              vehicle: {
                id: vehicle.id,
                mileage: vehicle.mileage,
                label: [vehicle.plate ? formatPlate(vehicle.plate) : "Sem placa", [vehicle.brand, vehicle.model].filter(Boolean).join(" ")]
                  .filter(Boolean)
                  .join(" — "),
              },
              items: [],
              discountType: "",
              discountValue: "",
              surchargeType: "",
              surchargeValue: "",
              validUntil: "",
              internalNotes: "",
              customerMessage: "",
              customerComplaint: appointment.description ?? "",
            }}
          />
        </>
      ) : (
        <QuoteForm mode="create" />
      )}
    </div>
  );
}
