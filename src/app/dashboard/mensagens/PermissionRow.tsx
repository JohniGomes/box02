"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { answerConsentAction, markMessageAction } from "./actions";

/**
 * Pedido de permissão para lembretes: abre o WhatsApp com o pedido pronto; depois você marca
 * "Já pedi" e, quando o cliente responder, "Autorizou" ou "Não quer". Nada é enviado sozinho.
 */
export function PermissionRow({
  refId,
  customerName,
  context,
  text,
  whatsappUrl,
  state,
}: {
  refId: string;
  customerName: string;
  context: string;
  text: string;
  whatsappUrl: string;
  state: "PEDIR" | "AGUARDANDO";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.success) {
        setError(result.error ?? "Não foi possível registrar.");
        return;
      }
      router.refresh();
    });
  }

  const outline = "h-10 rounded-xl border border-border px-4 text-sm font-medium disabled:opacity-50";

  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
      <div>
        <p className="text-sm font-semibold">
          {customerName}
          {state === "AGUARDANDO" ? <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold">Aguardando resposta</span> : null}
        </p>
        <p className="text-xs text-muted">{context}</p>
      </div>
      <p className="whitespace-pre-wrap rounded-xl bg-background p-3 text-sm">{text}</p>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <a href={whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground">
          {state === "AGUARDANDO" ? "Pedir de novo" : "Pedir no WhatsApp"}
        </a>
        {state === "PEDIR" ? (
          <button onClick={() => run(() => markMessageAction("PERMISSAO", refId, "ENVIADA"))} disabled={isPending} className={outline}>
            Já pedi
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Cliente respondeu:</span>
        <button onClick={() => run(() => answerConsentAction(refId, "SIM"))} disabled={isPending} className={outline}>
          Autorizou
        </button>
        <button onClick={() => run(() => answerConsentAction(refId, "NAO"))} disabled={isPending} className={outline}>
          Não quer
        </button>
        {state === "PEDIR" ? (
          <button onClick={() => run(() => markMessageAction("PERMISSAO", refId, "PULADA"))} disabled={isPending} className="text-xs text-muted underline disabled:opacity-50">
            Agora não
          </button>
        ) : null}
      </div>
    </li>
  );
}
