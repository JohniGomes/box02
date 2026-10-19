import { ServiceRequestForm } from "./ServiceRequestForm";

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
      </div>
    </main>
  );
}
