"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveReviewLinkAction } from "./actions";

export function ReviewLinkForm({ initial }: { initial: string }) {
  const router = useRouter();
  const [link, setLink] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveReviewLinkAction(link);
      if (!result.success) {
        setError(result.error ?? "Não foi possível salvar.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
      <label className="text-sm font-semibold" htmlFor="reviewLink">
        Link de avaliação no Google
      </label>
      <p className="text-xs text-muted">
        Cole aqui o link do Perfil da Empresa no Google. Sem ele, o pedido de avaliação não aparece na fila.
      </p>
      <input
        id="reviewLink"
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder="https://g.page/r/..."
        className="h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-accent"
      />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <button
        onClick={save}
        disabled={isPending}
        className="h-10 rounded-xl bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-50"
      >
        {isPending ? "Salvando…" : saved ? "Salvo!" : "Salvar link"}
      </button>
    </div>
  );
}
