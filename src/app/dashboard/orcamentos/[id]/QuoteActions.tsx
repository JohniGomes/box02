"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelQuoteVersionAction,
  createNewQuoteVersionAction,
  sendQuoteVersionAction,
} from "../actions";

function ActionButton({
  label,
  pendingLabel,
  onRun,
  variant = "default",
}: {
  label: string;
  pendingLabel: string;
  onRun: () => Promise<{ success: boolean; error?: string }>;
  variant?: "default" | "primary" | "danger";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const classes =
    variant === "primary"
      ? "bg-accent text-accent-foreground"
      : variant === "danger"
        ? "border border-danger/40 text-danger"
        : "border border-border text-foreground";

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await onRun();
            if (!result.success) {
              setError(result.error ?? "Ação não pôde ser concluída.");
              return;
            }
            router.refresh();
          });
        }}
        disabled={isPending}
        className={`h-11 rounded-xl px-4 text-sm font-semibold disabled:opacity-60 ${classes}`}
      >
        {isPending ? pendingLabel : label}
      </button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export function SendQuoteButton({ quoteId }: { quoteId: string }) {
  return (
    <ActionButton
      label="Enviar orçamento"
      pendingLabel="Enviando…"
      variant="primary"
      onRun={() => sendQuoteVersionAction(quoteId)}
    />
  );
}

export function NewVersionButton({ quoteId }: { quoteId: string }) {
  return (
    <ActionButton
      label="Criar nova versão"
      pendingLabel="Criando…"
      onRun={() => createNewQuoteVersionAction(quoteId)}
    />
  );
}

export function CancelQuoteButton({ quoteId }: { quoteId: string }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="h-11 rounded-xl border border-danger/40 px-4 text-sm font-semibold text-danger"
      >
        Cancelar orçamento
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-danger/30 bg-danger/5 p-4">
      <p className="text-sm">Cancelar este orçamento? Ele fica registrado no histórico, só não segue mais em andamento.</p>
      <div className="flex gap-2">
        <div className="flex-1">
          <ActionButton
            label="Confirmar cancelamento"
            pendingLabel="Cancelando…"
            variant="danger"
            onRun={() => cancelQuoteVersionAction(quoteId)}
          />
        </div>
        <button
          onClick={() => setConfirming(false)}
          className="h-11 flex-1 rounded-xl border border-border text-sm font-medium"
        >
          Voltar
        </button>
      </div>
    </div>
  );
}
