"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCardFeeAction } from "./actions";

/** Taxa que a maquininha cobra no cartão: só serve para estimar o lucro (OS e Financeiro). */
export function CardFeeForm({ initialPercent }: { initialPercent: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(initialPercent).replace(".", ","));
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await setCardFeeAction(value);
      setIsError(!result.success);
      setMessage(result.success ? "Taxa salva." : (result.error ?? "Não foi possível salvar."));
      if (result.success) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5">
      <label htmlFor="cardFee" className="text-sm font-semibold">
        Taxa da maquininha no cartão (%)
      </label>
      <p className="text-xs text-muted">
        Vale para qualquer pagamento no cartão (débito e crédito). Entra como custo na margem da OS e no Financeiro, só como estimativa: as
        &quot;Entradas&quot; continuam mostrando o valor cheio que o cliente pagou.
      </p>
      <div className="flex gap-2">
        <input
          id="cardFee"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-12 w-32 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="h-12 rounded-xl bg-accent px-5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          {isPending ? "Salvando…" : "Salvar taxa"}
        </button>
      </div>
      {message ? <p className={`text-xs ${isError ? "text-danger" : "text-success"}`}>{message}</p> : null}
    </div>
  );
}
