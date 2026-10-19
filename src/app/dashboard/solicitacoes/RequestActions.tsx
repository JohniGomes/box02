"use client";

import { useState } from "react";
import { markServiceRequestAttendedAction, discardServiceRequestAction } from "./actions";

export function RequestActions({ serviceRequestId }: { serviceRequestId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: (id: string) => Promise<{ success: boolean; error?: string }>) {
    setPending(true);
    setError(null);
    const result = await action(serviceRequestId);
    setPending(false);
    if (!result.success) setError(result.error ?? "Não foi possível concluir.");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(markServiceRequestAttendedAction)}
          className="h-9 flex-1 rounded-lg bg-success/15 text-xs font-semibold text-success disabled:opacity-50 active:scale-[0.98]"
        >
          Marcar atendida
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(discardServiceRequestAction)}
          className="h-9 flex-1 rounded-lg bg-danger/15 text-xs font-semibold text-danger disabled:opacity-50 active:scale-[0.98]"
        >
          Descartar
        </button>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
