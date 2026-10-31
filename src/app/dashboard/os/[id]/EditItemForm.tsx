"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { correctWorkOrderItemAction } from "../actions";

/**
 * "Corrigir descrição/valor" de um item da OS (inclusive os que vieram do orçamento).
 * Descrição vale sempre; valor só com a OS aberta e pede motivo. Fica registrado quem mudou.
 */
export function EditItemForm({
  workOrderId,
  itemId,
  description,
  unitPriceReais,
  canEditValue,
}: {
  workOrderId: string;
  itemId: string;
  description: string;
  /** Valor atual por unidade, no formato "150,00". */
  unitPriceReais: string;
  /** OS aberta e item não cancelado. */
  canEditValue: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(description);
  const [price, setPrice] = useState(unitPriceReais);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const priceChanged = canEditValue && price.trim() !== "" && price.trim() !== unitPriceReais;
  const textChanged = text.trim() !== description;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await correctWorkOrderItemAction(workOrderId, itemId, {
        description: textChanged ? text : undefined,
        unitPriceReais: priceChanged ? price : undefined,
        reason: reason || undefined,
      });
      if (!result.success) {
        setError(result.error ?? "Não foi possível corrigir o item.");
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
        Corrigir descrição{canEditValue ? "/valor" : ""}
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
      <label className="text-[11px] font-medium text-muted" htmlFor={`desc-${itemId}`}>
        Descrição
      </label>
      <textarea
        id={`desc-${itemId}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
      />
      {canEditValue ? (
        <>
          <label className="text-[11px] font-medium text-muted" htmlFor={`price-${itemId}`}>
            Valor por unidade (R$)
          </label>
          <input
            id={`price-${itemId}`}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent"
          />
        </>
      ) : (
        <p className="text-[11px] text-muted">
          O valor não muda aqui: esta OS já foi entregue ou o item foi cancelado. Para mudar valores de uma OS entregue, use &quot;Reabrir OS&quot; nas
          correções.
        </p>
      )}
      {priceChanged ? (
        <>
          <p className="rounded-lg bg-accent/10 p-2 text-[11px]">
            Atenção: mudar o valor muda o total da OS. Se o cliente já aprovou o valor antigo, avise-o. Fica registrado quem mudou e o valor de antes.
          </p>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo da mudança de valor (obrigatório)"
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent"
          />
        </>
      ) : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={isPending || (!textChanged && !priceChanged) || text.trim().length < 2 || (priceChanged && reason.trim().length < 3)}
          className="h-9 flex-1 rounded-lg bg-accent text-xs font-semibold text-accent-foreground disabled:opacity-50"
        >
          {isPending ? "Salvando…" : "Salvar correção"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-9 flex-1 rounded-lg border border-border text-xs">
          Voltar
        </button>
      </div>
    </div>
  );
}
