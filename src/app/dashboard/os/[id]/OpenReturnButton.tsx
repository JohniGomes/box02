"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { openWorkOrderReturnAction } from "../actions";

/** Abre (ou retoma) a OS de retorno de uma OS já entregue. */
export function OpenReturnButton({ workOrderId }: { workOrderId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await openWorkOrderReturnAction(workOrderId);
      if (!result.success || !result.workOrderId) {
        setError(result.error ?? "Não foi possível abrir o retorno.");
        return;
      }
      router.push(`/dashboard/os/${result.workOrderId}`);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="h-11 rounded-xl border border-border px-4 text-sm font-medium disabled:opacity-50"
      >
        {isPending ? "Abrindo retorno…" : "Abrir retorno (o carro voltou)"}
      </button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
