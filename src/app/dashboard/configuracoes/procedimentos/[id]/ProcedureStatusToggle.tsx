"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inactivateProcedureAction, reactivateProcedureAction } from "../actions";

export function ProcedureStatusToggle({ procedureId, status }: { procedureId: string; status: "ATIVO" | "INATIVO" }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggle() {
    setError(null);
    startTransition(async () => {
      const result =
        status === "ATIVO" ? await inactivateProcedureAction(procedureId) : await reactivateProcedureAction(procedureId);
      if (!result.success) {
        setError(result.error ?? "Falha ao atualizar.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleToggle}
        disabled={isPending}
        className={`h-11 rounded-xl border text-sm font-medium disabled:opacity-60 ${
          status === "ATIVO" ? "border-danger/40 text-danger" : "border-success/40 text-success"
        }`}
      >
        {isPending ? "Aguarde…" : status === "ATIVO" ? "Inativar procedimento" : "Reativar procedimento"}
      </button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
