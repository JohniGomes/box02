"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inactivateCustomerAction, reactivateCustomerAction } from "../actions";
import type { CustomerStatus } from "@/lib/db/repositories/customers";

export function CustomerStatusActions({
  customerId,
  status,
}: {
  customerId: string;
  status: CustomerStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleInactivate() {
    setError(null);
    startTransition(async () => {
      const result = await inactivateCustomerAction(customerId);
      if (!result.success) {
        setError(result.error ?? "Falha ao inativar.");
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  function handleReactivate() {
    setError(null);
    startTransition(async () => {
      const result = await reactivateCustomerAction(customerId);
      if (!result.success) {
        setError(result.error ?? "Falha ao reativar.");
        return;
      }
      router.refresh();
    });
  }

  if (status === "INATIVO") {
    return (
      <div className="flex flex-col gap-2">
        <button
          onClick={handleReactivate}
          disabled={isPending}
          className="h-11 rounded-xl border border-border px-4 text-sm font-medium disabled:opacity-60"
        >
          {isPending ? "Reativando…" : "Reativar cliente"}
        </button>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-danger/30 bg-danger/5 p-4">
        <p className="text-sm">
          Inativar este cliente? O histórico não será apagado — ele só deixa de aparecer nas
          buscas padrão.
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleInactivate}
            disabled={isPending}
            className="h-10 flex-1 rounded-lg bg-danger text-sm font-semibold text-white disabled:opacity-60"
          >
            {isPending ? "Inativando…" : "Confirmar"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="h-10 flex-1 rounded-lg border border-border text-sm font-medium"
          >
            Cancelar
          </button>
        </div>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="h-11 rounded-xl border border-danger/40 px-4 text-sm font-medium text-danger"
    >
      Inativar cliente
    </button>
  );
}
