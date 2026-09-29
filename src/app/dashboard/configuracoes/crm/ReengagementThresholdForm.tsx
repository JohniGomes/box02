"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setReengagementThresholdAction } from "./actions";

export function ReengagementThresholdForm({ initialDays }: { initialDays: number | null }) {
  const router = useRouter();
  const [value, setValue] = useState(initialDays !== null ? String(initialDays) : "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Informe um número de dias maior que zero.");
      return;
    }
    startTransition(async () => {
      const result = await setReengagementThresholdAction(Math.round(parsed));
      if (!result.success) {
        setError(result.error ?? "Falha ao salvar.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="threshold">
          Limite de dias sem retorno
        </label>
        <input
          id="threshold"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="numeric"
          placeholder="Ex.: 180"
          className="h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
      <button
        onClick={handleSave}
        disabled={isPending}
        className="h-12 rounded-xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50"
      >
        {isPending ? "Salvando…" : "Salvar limite"}
      </button>
    </div>
  );
}
