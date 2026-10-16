"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startWorkOrderChecklistAction } from "../checklistActions";

export function StartChecklistButton({
  workOrderId,
  type,
}: {
  workOrderId: string;
  type: "ENTRADA" | "ENTREGA";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleStart() {
    setError(null);
    startTransition(async () => {
      const result = await startWorkOrderChecklistAction(workOrderId, type);
      if (!result.success) {
        setError(result.error ?? "Falha ao iniciar.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 text-center">
      <p className="mb-3 text-sm text-muted">Checklist ainda não iniciado para esta OS.</p>
      <button
        type="button"
        onClick={handleStart}
        disabled={isPending}
        className="h-11 rounded-xl bg-accent px-6 text-sm font-semibold text-accent-foreground disabled:opacity-60"
      >
        {isPending ? "Iniciando…" : "Iniciar checklist"}
      </button>
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
