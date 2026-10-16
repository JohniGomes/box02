"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeWorkOrderChecklistAction } from "../checklistActions";

export function CompleteChecklistButton({
  workOrderId,
  workOrderChecklistId,
  pendingCount,
}: {
  workOrderId: string;
  workOrderChecklistId: string;
  pendingCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleComplete() {
    setError(null);
    startTransition(async () => {
      const result = await completeWorkOrderChecklistAction(workOrderId, workOrderChecklistId);
      if (!result.success) {
        setError(result.error ?? "Falha ao finalizar.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleComplete}
        disabled={isPending || pendingCount > 0}
        className="h-10 rounded-xl bg-accent px-5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
      >
        {isPending ? "Finalizando…" : "Finalizar checklist"}
      </button>
      {pendingCount > 0 ? (
        <span className="text-xs text-muted">{pendingCount} obrigatório(s) pendente(s)</span>
      ) : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
