"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { undoServiceRequestAttendanceAction } from "./actions";

/** Solicitação já atendida pelo "Atender": link para a agenda e opção de desfazer. */
export function UndoAttendedButton({ serviceRequestId }: { serviceRequestId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function undo() {
    setError(null);
    startTransition(async () => {
      const result = await undoServiceRequestAttendanceAction(serviceRequestId);
      if (!result.success) {
        setError(result.error ?? "Não foi possível desfazer.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/agendamentos" className="font-medium text-accent">
          Ver na agenda →
        </Link>
        {confirming ? (
          <>
            <button onClick={undo} disabled={isPending} className="font-semibold text-danger disabled:opacity-50">
              {isPending ? "Desfazendo…" : "Sim, desfazer"}
            </button>
            <button onClick={() => setConfirming(false)} className="text-muted">
              Voltar
            </button>
          </>
        ) : (
          <button onClick={() => setConfirming(true)} className="text-muted underline">
            Desfazer
          </button>
        )}
      </div>
      {confirming ? (
        <p className="text-muted">
          A solicitação volta para pendente e o agendamento criado é cancelado. O cliente e o veículo cadastrados ficam.
        </p>
      ) : null}
      {error ? <p className="text-danger">{error}</p> : null}
    </div>
  );
}
