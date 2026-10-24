"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markMessageAction } from "./actions";

/** Uma mensagem pronta: abre o WhatsApp do cliente e, depois, "Já enviei" tira da fila. */
export function MessageRow({
  kind,
  refId,
  customerName,
  context,
  text,
  whatsappUrl,
}: {
  kind: string;
  refId: string;
  customerName: string;
  context: string;
  text: string;
  whatsappUrl: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function mark(action: "ENVIADA" | "PULADA") {
    setError(null);
    startTransition(async () => {
      const result = await markMessageAction(kind, refId, action);
      if (!result.success) {
        setError(result.error ?? "Não foi possível registrar.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
      <div>
        <p className="text-sm font-semibold">{customerName}</p>
        <p className="text-xs text-muted">{context}</p>
      </div>
      <p className="whitespace-pre-wrap rounded-xl bg-background p-3 text-sm">{text}</p>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground"
        >
          Enviar no WhatsApp
        </a>
        <button
          onClick={() => mark("ENVIADA")}
          disabled={isPending}
          className="h-10 rounded-xl border border-border px-4 text-sm font-medium disabled:opacity-50"
        >
          Já enviei
        </button>
        <button onClick={() => mark("PULADA")} disabled={isPending} className="text-xs text-muted underline disabled:opacity-50">
          Pular
        </button>
      </div>
    </li>
  );
}
