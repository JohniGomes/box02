"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAppointmentAttendanceAction, updateAppointmentAction } from "./actions";

const inputClass =
  "h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

/** Marca comparecimento e corrige data/hora e descrição de um agendamento. */
export function AppointmentActions({
  appointmentId,
  status,
  initialDateTime,
  initialDescription,
}: {
  appointmentId: string;
  status: "AGENDADO" | "COMPARECEU" | "NAO_COMPARECEU";
  /** AAAA-MM-DDTHH:MM, do jeito que foi digitado. */
  initialDateTime: string;
  initialDescription: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [dateTime, setDateTime] = useState(initialDateTime);
  const [description, setDescription] = useState(initialDescription);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function mark(next: "AGENDADO" | "COMPARECEU" | "NAO_COMPARECEU") {
    setError(null);
    startTransition(async () => {
      const result = await setAppointmentAttendanceAction(appointmentId, next);
      if (!result.success) {
        setError(result.error ?? "Não foi possível salvar.");
        return;
      }
      router.refresh();
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateAppointmentAction(appointmentId, { scheduledAt: dateTime, description });
      if (!result.success) {
        setError(result.error ?? "Não foi possível salvar.");
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="mt-2 flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
        <input type="datetime-local" value={dateTime} onChange={(e) => setDateTime(e.target.value)} className={inputClass} />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Serviço / queixa do cliente"
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        {error ? <p className="text-xs text-danger">{error}</p> : null}
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={isPending || !dateTime}
            className="h-10 flex-1 rounded-xl bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            {isPending ? "Salvando…" : "Salvar"}
          </button>
          <button onClick={() => setEditing(false)} className="h-10 flex-1 rounded-xl border border-border text-sm">
            Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {status === "AGENDADO" ? (
        <>
          <button onClick={() => mark("COMPARECEU")} disabled={isPending} className="h-8 rounded-lg bg-success/15 px-3 text-xs font-semibold text-success disabled:opacity-50">
            Compareceu
          </button>
          <button onClick={() => mark("NAO_COMPARECEU")} disabled={isPending} className="h-8 rounded-lg border border-border px-3 text-xs font-medium disabled:opacity-50">
            Não compareceu
          </button>
          <button onClick={() => setEditing(true)} className="h-8 rounded-lg border border-border px-3 text-xs font-medium">
            Editar
          </button>
        </>
      ) : (
        <>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              status === "COMPARECEU" ? "bg-success/15 text-success" : "bg-muted/20 text-muted"
            }`}
          >
            {status === "COMPARECEU" ? "Compareceu" : "Não compareceu"}
          </span>
          <button onClick={() => mark("AGENDADO")} disabled={isPending} className="text-xs text-muted underline disabled:opacity-50">
            Desfazer
          </button>
        </>
      )}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}
