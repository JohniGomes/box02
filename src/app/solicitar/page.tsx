import { ServiceRequestForm } from "./ServiceRequestForm";
import { BUSINESS_HOURS } from "@/lib/serviceRequests/businessInfo";
import { SERVICE_REQUEST_NOTIFY_TEAM } from "@/lib/serviceRequests/notifyTeam";
import { whatsappLink } from "@/lib/validation/phone";

export default function PublicServiceRequestPage() {
  return (
    <main className="flex min-h-screen flex-col bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div
            aria-hidden
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- emblema oficial (PNG de referência), não um ícone do design system */}
            <img src="/box02-mark.png" alt="" className="h-9 w-9 object-contain" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">BOX 02</h1>
          <p className="text-sm text-muted">Diga o que você precisa — a gente entra em contato.</p>
        </div>

        <ServiceRequestForm />

        <footer className="mt-8 flex flex-col gap-3 border-t border-border pt-5 text-center">
          <div>
            <p className="text-xs font-semibold">Horário de atendimento</p>
            <ul className="mt-1 text-xs text-muted">
              {BUSINESS_HOURS.map((h) => (
                <li key={h.days}>
                  {h.days}: {h.hours}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold">Prefere falar direto? Chame no WhatsApp</p>
            <div className="mt-2 flex gap-2">
              {SERVICE_REQUEST_NOTIFY_TEAM.map((person) => (
                <a
                  key={person.phone}
                  href={whatsappLink(person.phone)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-11 flex-1 items-center justify-center rounded-xl border border-border text-sm font-medium"
                >
                  {person.name}
                </a>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
