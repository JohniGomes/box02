import Link from "next/link";
import { AppointmentForm } from "../AppointmentForm";

export default function NewAppointmentPage() {
  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard" className="text-sm text-muted underline-offset-2 hover:underline">
        ← Início
      </Link>
      <h1 className="text-lg font-semibold tracking-tight">Novo agendamento</h1>
      <AppointmentForm />
    </div>
  );
}
