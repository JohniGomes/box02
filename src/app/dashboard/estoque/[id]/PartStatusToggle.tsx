"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPartStatusAction } from "../actions";
import type { PartStatus } from "@/lib/db/repositories/parts";

export function PartStatusToggle({ partId, status }: { partId: string; status: PartStatus }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggle() {
    setError(null);
    startTransition(async () => {
      const result = await setPartStatusAction(partId, status === "ATIVO" ? "INATIVO" : "ATIVO");
      if (!result.success) {
        setError(result.error ?? "Falha ao atualizar.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleToggle}
        disabled={isPending}
        className={`h-9 rounded-lg border px-3 text-xs font-medium disabled:opacity-60 ${
          status === "ATIVO" ? "border-danger/40 text-danger" : "border-success/40 text-success"
        }`}
      >
        {isPending ? "Aguarde…" : status === "ATIVO" ? "Inativar" : "Reativar"}
      </button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
