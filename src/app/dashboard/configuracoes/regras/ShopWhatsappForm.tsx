"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setShopWhatsappAction } from "./actions";

/** WhatsApp da oficina: é para onde vão os botões "Quero receber lembretes" e "Agendar" da página do QR Car. */
export function ShopWhatsappForm({ initial }: { initial: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await setShopWhatsappAction(value);
      setIsError(!result.success);
      setMessage(result.success ? "WhatsApp salvo." : (result.error ?? "Não foi possível salvar."));
      if (result.success) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5">
      <label htmlFor="shopWhatsapp" className="text-sm font-semibold">
        WhatsApp da oficina (QR Car)
      </label>
      <p className="text-xs text-muted">
        Número que recebe as mensagens do cliente quando ele toca em &quot;Quero receber lembretes&quot; ou &quot;Agendar um horário&quot; na página
        do QR. Sem número, a página mostra só &quot;fale com a BOX 02&quot;.
      </p>
      <div className="flex gap-2">
        <input
          id="shopWhatsapp"
          inputMode="tel"
          placeholder="(62) 99999-0000"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-12 w-56 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="h-12 rounded-xl bg-accent px-5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          {isPending ? "Salvando…" : "Salvar"}
        </button>
      </div>
      {message ? <p className={`text-xs ${isError ? "text-danger" : "text-success"}`}>{message}</p> : null}
    </div>
  );
}
