"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { correctWorkOrderItemCostAction } from "../actions";

/**
 * "Corrigir custo" de um item já executado (uso interno). Muda só a margem da OS e do mês: não mexe no
 * valor cobrado, no recibo nem no estoque. Pede motivo; fica registrado o custo de antes.
 */
export function EditItemCostForm({
  workOrderId,
  itemId,
  currentCostReais,
}: {
  workOrderId: string;
  itemId: string;
  /** Custo atual por unidade ("30,00"), ou vazio quando não foi informado. */
  currentCostReais: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cost, setCost] = useState(currentCostReais);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await correctWorkOrderItemCostAction(workOrderId, itemId, { unitCostReais: cost, reason });
      if (!result.success) {
        setError(result.error ?? "Não foi possível corrigir o custo.");
        return;
      }
      setOpen(false);
      setReason("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 text-xs font-medium text-accent">
        {currentCostReais ? `Custo R$ ${currentCostReais} · corrigir` : "Sem custo informado · informar custo"}
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
      <label className="text-[11px] font-medium text-muted" htmlFor={`cost-${itemId}`}>
        Custo por unidade (R$) — uso interno
      </label>
      <input
        id={`cost-${itemId}`}
        value={cost}
        onChange={(e) => setCost(e.target.value)}
        inputMode="decimal"
        placeholder="0,00"
        className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent"
      />
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo (ex.: custo não tinha sido informado)"
        className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent"
      />
      <p className="text-[11px] text-muted">
        Muda só a margem da OS e do mês. O valor cobrado, o recibo e o estoque não mudam. Fica registrado o custo de antes.
      </p>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={isPending || cost.trim() === "" || reason.trim().length < 3}
          className="h-9 flex-1 rounded-lg bg-accent text-xs font-semibold text-accent-foreground disabled:opacity-50"
        >
          {isPending ? "Salvando…" : "Salvar custo"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-9 flex-1 rounded-lg border border-border text-xs">
          Voltar
        </button>
      </div>
    </div>
  );
}
