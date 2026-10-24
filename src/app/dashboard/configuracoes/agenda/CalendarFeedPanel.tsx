"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { regenerateCalendarFeedTokenAction } from "./actions";

export function CalendarFeedPanel({ url }: { url: string | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function generate() {
    setError(null);
    startTransition(async () => {
      const result = await regenerateCalendarFeedTokenAction();
      if (!result.success) {
        setError(result.error ?? "Não foi possível gerar o endereço.");
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Não consegui copiar. Selecione o endereço e copie à mão.");
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      {url ? (
        <>
          <p className="break-all rounded-xl bg-background p-3 font-mono text-xs">{url}</p>
          <div className="flex gap-2">
            <button onClick={copy} className="h-10 flex-1 rounded-xl bg-accent text-sm font-semibold text-accent-foreground">
              {copied ? "Copiado!" : "Copiar endereço"}
            </button>
            {confirming ? (
              <button
                onClick={generate}
                disabled={isPending}
                className="h-10 flex-1 rounded-xl bg-danger text-sm font-semibold text-white disabled:opacity-50"
              >
                {isPending ? "Trocando…" : "Confirmar troca"}
              </button>
            ) : (
              <button onClick={() => setConfirming(true)} className="h-10 flex-1 rounded-xl border border-border text-sm font-medium">
                Trocar endereço
              </button>
            )}
          </div>
          {confirming ? (
            <p className="text-xs text-muted">
              Trocar faz o endereço antigo parar de funcionar: será preciso colar o novo no Google Agenda de cada pessoa.
            </p>
          ) : null}
        </>
      ) : (
        <button
          onClick={generate}
          disabled={isPending}
          className="h-11 rounded-xl bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          {isPending ? "Gerando…" : "Gerar endereço da agenda"}
        </button>
      )}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
