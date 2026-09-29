"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatBRL } from "@/lib/money";
import { reconcileEntryAction, undoReconciliationAction } from "./actions";

export type ReconciliationEntryType = "RECEBIMENTO" | "DESPESA";

export interface ReconciliationEntryView {
  entryType: ReconciliationEntryType;
  entryId: string;
  description: string;
  amountCents: number;
  date: string;
  reconciledAt: string | null;
}

const inputClass =
  "h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

export function ConciliacaoClient({
  from,
  to,
  entries,
  reconciledCents,
  pendingCents,
}: {
  from: string;
  to: string;
  entries: ReconciliationEntryView[];
  reconciledCents: number;
  pendingCents: number;
}) {
  const router = useRouter();
  const [fromInput, setFromInput] = useState(from);
  const [toInput, setToInput] = useState(to);

  function applyPeriod() {
    router.push(`/dashboard/conciliacao?from=${fromInput}&to=${toInput}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface p-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-muted">De</label>
          <input type="date" value={fromInput} onChange={(e) => setFromInput(e.target.value)} className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-muted">Até</label>
          <input type="date" value={toInput} onChange={(e) => setToInput(e.target.value)} className={inputClass} />
        </div>
        <button
          onClick={applyPeriod}
          className="h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground active:scale-[0.98]"
        >
          Filtrar
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-center text-sm">
        <div className="rounded-xl border border-success/20 bg-success/5 p-3">
          <dt className="text-[10px] text-muted">Conciliado no período (saldo líquido)</dt>
          <dd className="font-semibold text-success">
            {reconciledCents < 0 ? "-" : ""}
            {formatBRL(Math.abs(reconciledCents))}
          </dd>
        </div>
        <div className="rounded-xl border border-danger/20 bg-danger/5 p-3">
          <dt className="text-[10px] text-muted">Pendente de conciliação (saldo líquido)</dt>
          <dd className="font-semibold text-danger">
            {pendingCents < 0 ? "-" : ""}
            {formatBRL(Math.abs(pendingCents))}
          </dd>
        </div>
      </dl>

      {entries.length === 0 ? (
        <p className="text-sm text-muted">Nenhum lançamento (recebimento ou despesa paga) neste período.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <EntryRow key={`${entry.entryType}-${entry.entryId}`} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EntryRow({ entry }: { entry: ReconciliationEntryView }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isReconciled = Boolean(entry.reconciledAt);
  const isExpense = entry.entryType === "DESPESA";

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = isReconciled
        ? await undoReconciliationAction(entry.entryType, entry.entryId)
        : await reconcileEntryAction(entry.entryType, entry.entryId);
      if (!result.success) {
        setError(result.error ?? "Falha ao atualizar conciliação.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <li
      className={`flex items-center justify-between gap-2 rounded-xl border p-3 text-sm ${
        isReconciled ? "border-success/20 bg-success/5" : "border-border bg-background"
      }`}
    >
      <div>
        <span className="text-xs font-medium text-muted">{isExpense ? "Despesa" : "Recebimento"}</span>
        <p className="font-medium">{entry.description}</p>
        <p className="text-xs text-muted">{new Date(entry.date).toLocaleDateString("pt-BR")}</p>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className={`font-semibold ${isExpense ? "text-danger" : "text-success"}`}>
          {isExpense ? "-" : ""}
          {formatBRL(Math.abs(entry.amountCents))}
        </span>
        <button
          onClick={toggle}
          disabled={isPending}
          className={`rounded-lg px-2 py-1 text-xs font-semibold disabled:opacity-50 ${
            isReconciled ? "border border-border text-muted" : "bg-accent text-accent-foreground"
          }`}
        >
          {isPending ? "..." : isReconciled ? "Desfazer" : "Conciliar"}
        </button>
      </div>
    </li>
  );
}
