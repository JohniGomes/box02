"use client";

import { useState, useTransition } from "react";
import { createPurchasedPartAction, type PartPickerOption } from "@/app/dashboard/estoque/actions";
import { formatBRL, markupPercentForPrice, reaisToCents } from "@/lib/money";
import {
  PurchasePaymentFields,
  defaultQuickPayment,
  quickPaymentIsValid,
  quickPaymentToInput,
  type QuickPayment,
} from "@/components/PurchasePaymentFields";

const inputClass =
  "h-11 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent";

/**
 * "Peça comprada para este cliente": cadastra a peça nova (custo + preço) e dá a
 * entrada no estoque na hora, sem sair do orçamento/OS. Depois chama
 * `onCreated` para o item ser preenchido com a peça, o preço e a quantidade.
 * O que fica gravado é custo e markup; o preço de venda é só outra forma de
 * informar o markup.
 */
export function PurchasedPartButton({
  onCreated,
}: {
  onCreated: (part: PartPickerOption, quantity: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [costReais, setCostReais] = useState("");
  const [priceReais, setPriceReais] = useState("");
  const [payment, setPayment] = useState<QuickPayment>(defaultQuickPayment());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const costCents = costReais.trim() ? reaisToCents(costReais) : 0;
  const priceCents = priceReais.trim() ? reaisToCents(priceReais) : 0;
  const markup = costCents > 0 && priceCents > 0 ? markupPercentForPrice(costCents, priceCents) : null;
  const belowCost = markup !== null && markup < 0;

  function reset() {
    setName("");
    setQuantity("1");
    setCostReais("");
    setPriceReais("");
    setPayment(defaultQuickPayment());
    setError(null);
  }

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const result = await createPurchasedPartAction({
        name,
        quantity,
        costReais,
        priceReais,
        payment: quickPaymentToInput(payment),
      });
      if (!result.success || !result.part) {
        setError(result.error ?? "Não foi possível cadastrar a peça.");
        return;
      }
      onCreated(result.part, result.quantity ?? 1);
      reset();
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-10 rounded-lg border border-border px-3 text-xs font-semibold text-foreground"
      >
        Peça comprada p/ este cliente
      </button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-border bg-background p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">Peça comprada para este cliente</span>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted">
          Fechar
        </button>
      </div>
      <p className="text-[11px] text-muted">
        Cadastra a peça e dá a entrada no estoque agora. Quando o item for executado, a baixa fecha o saldo.
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome da peça (ex.: Radiador Palio 1.0)"
        className={inputClass}
      />
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[11px] text-muted">Quantidade</label>
          <input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            inputMode="numeric"
            className={`${inputClass} w-full`}
          />
        </div>
        <div>
          <label className="text-[11px] text-muted">Comprei por (R$)</label>
          <input
            value={costReais}
            onChange={(e) => setCostReais(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            className={`${inputClass} w-full`}
          />
        </div>
        <div>
          <label className="text-[11px] text-muted">Vendo por (R$)</label>
          <input
            value={priceReais}
            onChange={(e) => setPriceReais(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            className={`${inputClass} w-full`}
          />
        </div>
      </div>
      {markup !== null && !belowCost ? (
        <p className="text-xs text-muted">
          Lucro de {formatBRL(priceCents - costCents)} por unidade ({String(markup).replace(".", ",")}%).
        </p>
      ) : null}
      {belowCost ? <p className="text-xs text-danger">O preço de venda está abaixo do custo.</p> : null}
      <PurchasePaymentFields value={payment} onChange={setPayment} />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <button
        type="button"
        onClick={handleCreate}
        disabled={isPending || name.trim().length < 2 || !costReais.trim() || belowCost || !quickPaymentIsValid(payment)}
        className="h-11 rounded-lg bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-50"
      >
        {isPending ? "Cadastrando…" : "Cadastrar peça e usar no item"}
      </button>
    </div>
  );
}
