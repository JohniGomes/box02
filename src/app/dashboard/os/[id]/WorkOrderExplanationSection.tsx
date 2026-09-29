"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateExplanationAction } from "../methodActions";

export function WorkOrderExplanationSection({
  workOrderId,
  diagnosisExplanationNotes,
  quoteCustomerMessage,
  canManage,
}: {
  workOrderId: string;
  diagnosisExplanationNotes: string | null;
  quoteCustomerMessage: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(diagnosisExplanationNotes ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateExplanationAction(workOrderId, notes);
      if (!result.success) {
        setError(result.error ?? "Falha ao salvar.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Explicamos</h2>
      <p className="mb-3 text-[11px] text-muted">
        Como o diagnóstico foi explicado ao cliente, em linguagem simples.
      </p>

      {quoteCustomerMessage ? (
        <div className="mb-3 rounded-xl border border-border bg-background p-3">
          <p className="mb-1 text-[11px] font-medium text-muted">Mensagem do orçamento</p>
          <p className="whitespace-pre-wrap text-sm">{quoteCustomerMessage}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-medium text-muted" htmlFor="explanation">
          Explicação registrada nesta OS
        </label>
        <textarea
          id="explanation"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={!canManage}
          rows={3}
          className="rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
          placeholder="Ex.: Expliquei que a folga na suspensão está causando o barulho e mostrei onde fica a peça."
        />
        {canManage ? (
          <button
            onClick={handleSave}
            disabled={isPending}
            className="h-10 self-start rounded-lg border border-border px-4 text-xs font-semibold disabled:opacity-60"
          >
            {isPending ? "Salvando…" : "Salvar explicação"}
          </button>
        ) : null}
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    </section>
  );
}
