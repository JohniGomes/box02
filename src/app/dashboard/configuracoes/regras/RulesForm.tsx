"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setReceptionRequiredAction } from "./actions";

export function RulesForm({ receptionRequired }: { receptionRequired: boolean }) {
  const router = useRouter();
  const [required, setRequired] = useState(receptionRequired);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(next: boolean) {
    setError(null);
    setRequired(next);
    startTransition(async () => {
      const result = await setReceptionRequiredAction(next);
      if (!result.success) {
        setRequired(!next);
        setError(result.error ?? "Não foi possível salvar.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={required}
          disabled={isPending}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-1 h-5 w-5 shrink-0"
        />
        <span>
          <span className="block text-sm font-semibold">
            Exigir o Termo de Recepção aceito para iniciar a execução da OS
          </span>
          <span className="mt-1 block text-xs text-muted">
            {required
              ? "Ligado: a OS só passa para \"Em execução\" depois que o termo for aceito (como sempre foi)."
              : "Desligado: a OS pode começar a execução sem o termo. Ele continua existindo e aparece como \"Aceite pendente\" na OS e na lista, para registrar depois."}
          </span>
        </span>
      </label>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
