"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { linkAppointmentToWorkOrderAction, listLinkableWorkOrdersAction } from "./actions";

interface Candidate {
  id: string;
  number: string;
  status: string;
  vehicleLabel: string | null;
}

/** "Já existe OS?": liga o agendamento a uma OS criada por outro caminho, para não duplicar. */
export function LinkWorkOrder({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [suggestedId, setSuggestedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function load() {
    setOpen(true);
    setLoading(true);
    const result = await listLinkableWorkOrdersAction(appointmentId);
    setCandidates(result.candidates);
    setSuggestedId(result.suggestedId);
    setLoading(false);
  }

  function link(workOrderId: string) {
    setError(null);
    startTransition(async () => {
      const result = await linkAppointmentToWorkOrderAction(appointmentId, workOrderId);
      if (!result.success) {
        setError(result.error ?? "Não foi possível ligar.");
        return;
      }
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={load}
        className="h-8 rounded-lg border border-border px-3 text-xs font-semibold"
      >
        Já existe OS? Ligar
      </button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-border bg-background p-3 text-sm">
      {loading ? (
        <p className="text-xs text-muted">Procurando OS deste cliente…</p>
      ) : candidates.length === 0 ? (
        <p className="text-xs text-muted">Não achei OS deste cliente para ligar. Se for um serviço novo, use &quot;Criar OS&quot;.</p>
      ) : (
        <>
          <p className="text-xs text-muted">Escolha a OS que é deste agendamento:</p>
          <ul className="flex flex-col gap-1.5">
            {candidates.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <span className="text-xs">
                  <span className="font-mono font-semibold">{c.number}</span>
                  {c.vehicleLabel ? ` · ${c.vehicleLabel}` : ""} · {c.status.toLowerCase().replace("_", " ")}
                  {c.id === suggestedId ? <span className="ml-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">parece ser esta</span> : null}
                </span>
                <button
                  onClick={() => link(c.id)}
                  disabled={isPending}
                  className="h-8 shrink-0 rounded-lg bg-accent px-3 text-xs font-semibold text-accent-foreground disabled:opacity-50"
                >
                  Ligar
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <button type="button" onClick={() => setOpen(false)} className="w-fit text-xs text-muted underline">
        Fechar
      </button>
    </div>
  );
}
