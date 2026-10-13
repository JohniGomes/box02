"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelAppointmentAction } from "./actions";

export function CancelAppointmentButton({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs font-medium text-danger"
      >
        Cancelar
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {error ? <span className="text-xs text-danger">{error}</span> : null}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await cancelAppointmentAction(appointmentId);
            if (!result.success) {
              setError(result.error ?? "Não foi possível cancelar.");
              return;
            }
            router.refresh();
          })
        }
        className="text-xs font-semibold text-danger"
      >
        {pending ? "Cancelando…" : "Confirmar"}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-xs text-muted">
        Voltar
      </button>
    </div>
  );
}
