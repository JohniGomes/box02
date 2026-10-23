"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LastMileageHint } from "@/components/LastMileageHint";
import { updateQuoteCheckInAction } from "../actions";

/**
 * Queixa do cliente e KM do painel — parte fixa do orçamento. Passam sozinhos
 * para a OS quando ela é criada, então não precisam ser digitados de novo.
 */
export function QuoteCheckInEditor({
  quoteId,
  initialComplaint,
  initialMileage,
  lastMileage,
}: {
  quoteId: string;
  initialComplaint: string | null;
  initialMileage: number | null;
  lastMileage?: number | null;
}) {
  const router = useRouter();
  const [complaint, setComplaint] = useState(initialComplaint ?? "");
  const [mileage, setMileage] = useState(initialMileage !== null ? String(initialMileage) : "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateQuoteCheckInAction(quoteId, { customerComplaint: complaint, mileageAtEntry: mileage });
      if (!result.success) {
        setError(result.error ?? "Falha ao salvar.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5 print:hidden">
      <h2 className="text-sm font-semibold">Queixa do cliente e KM</h2>
      <p className="text-xs text-muted">Passam para a OS quando ela for criada — não precisa digitar de novo.</p>
      <textarea
        value={complaint}
        onChange={(e) => setComplaint(e.target.value)}
        rows={3}
        placeholder="O que o cliente relatou (ex.: barulho na frente ao frear)"
        className="rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
      />
      <div className="flex flex-col gap-1">
        <label htmlFor="quoteKm" className="text-xs text-muted">
          KM do painel
        </label>
        <input
          id="quoteKm"
          value={mileage}
          onChange={(e) => setMileage(e.target.value)}
          inputMode="numeric"
          placeholder="Ex.: 98000"
          className="h-11 rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        <LastMileageHint lastMileage={lastMileage} current={mileage} onUse={setMileage} />
      </div>
      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="h-9 self-start rounded-lg border border-border px-4 text-xs font-semibold disabled:opacity-60"
      >
        {isPending ? "Salvando…" : "Salvar queixa e KM"}
      </button>
      {saved ? <p className="text-xs text-success">Salvo.</p> : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </section>
  );
}
