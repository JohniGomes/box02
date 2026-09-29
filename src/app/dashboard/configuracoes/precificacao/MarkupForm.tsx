"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDefaultMarkupPercentAction } from "./actions";

export function MarkupForm({ initialPercent }: { initialPercent: number | null }) {
  const router = useRouter();
  const [value, setValue] = useState(initialPercent !== null ? String(initialPercent) : "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    const parsed = Number(value.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("Informe um número maior ou igual a zero.");
      return;
    }
    startTransition(async () => {
      const result = await setDefaultMarkupPercentAction(parsed);
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
        <label className="text-sm font-medium" htmlFor="markup">Markup padrão (%)</label>
        <input
          id="markup"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="decimal"
          placeholder="Ex.: 40"
          className="h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        <p className="text-xs text-muted">
          Usado para calcular o preço sugerido de serviços que têm custo cadastrado mas não têm preço manual.
          Fórmula: preço calculado = custo × (1 + markup/100).
        </p>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
      <button
        onClick={handleSave}
        disabled={isPending}
        className="h-12 rounded-xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50"
      >
        {isPending ? "Salvando…" : "Salvar markup padrão"}
      </button>
    </div>
  );
}
