"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelQuoteVersionAction,
  createNewQuoteVersionAction,
  deleteQuoteAction,
  discardQuoteVersionAction,
  restorePreviousQuoteVersionAction,
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

/** Nova versão pede confirmação: copia os itens para um rascunho e passa a ser
 * a versão vigente. Se já existe OS, avisa que a OS NÃO muda. */
export function NewVersionButton({
  quoteId,
  currentVersionNumber,
  workOrderNumbers,
}: {
  quoteId: string;
  currentVersionNumber: number;
  workOrderNumbers: string[];
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="h-11 rounded-xl border border-border px-4 text-sm font-semibold text-foreground"
      >
        Criar nova versão
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      <p className="text-sm">
        Criar a versão {currentVersionNumber + 1}? Ela começa como <strong>rascunho</strong>, com os mesmos itens, e
        passa a ser a versão em uso. A versão {currentVersionNumber} fica guardada como está.
      </p>
      {workOrderNumbers.length > 0 ? (
        <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
          Atenção: este orçamento já virou {workOrderNumbers.length === 1 ? "a OS" : "as OS"}{" "}
          <strong>{workOrderNumbers.join(", ")}</strong>. Uma nova versão <strong>não altera</strong> a OS já criada.
        </p>
      ) : null}
      <div className="flex gap-2">
        <div className="flex-1">
          <ActionButton
            label="Sim, criar nova versão"
            pendingLabel="Criando…"
            variant="primary"
            onRun={() => createNewQuoteVersionAction(quoteId)}
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

/** Descarta a versão em uso e volta para a anterior (que continua como estava). */
export function DiscardVersionButton({
  quoteId,
  currentVersionNumber,
  previousVersionNumber,
  previousStatusLabel,
}: {
  quoteId: string;
  currentVersionNumber: number;
  previousVersionNumber: number;
  previousStatusLabel: string;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="h-11 rounded-xl border border-border px-4 text-sm font-semibold text-foreground"
      >
        Descartar versão {currentVersionNumber} e voltar para a {previousVersionNumber}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      <p className="text-sm">
        Descartar a versão {currentVersionNumber}? O orçamento volta para a versão {previousVersionNumber} (
        {previousStatusLabel}), do jeito que estava. A versão {currentVersionNumber} fica no histórico como
        cancelada.
      </p>
      <div className="flex gap-2">
        <div className="flex-1">
          <ActionButton
            label="Sim, descartar"
            pendingLabel="Descartando…"
            variant="primary"
            onRun={() => discardQuoteVersionAction(quoteId)}
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

/** Versão em uso foi cancelada: um toque devolve a anterior (ex.: aprovada). */
export function RestoreVersionButton({
  quoteId,
  previousVersionNumber,
  previousStatusLabel,
}: {
  quoteId: string;
  previousVersionNumber: number;
  previousStatusLabel: string;
}) {
  return (
    <ActionButton
      label={`Voltar para a versão ${previousVersionNumber} (${previousStatusLabel})`}
      pendingLabel="Voltando…"
      variant="primary"
      onRun={() => restorePreviousQuoteVersionAction(quoteId)}
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
        Cancelar orçamento inteiro
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-danger/30 bg-danger/5 p-4">
      <p className="text-sm">
        Cancelar o orçamento <strong>inteiro</strong>? Ele fica registrado no histórico, só não segue mais em
        andamento. (Para descartar só a versão nova e voltar para a anterior, use o outro botão.)
      </p>
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

export function DeleteQuoteButton({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteQuoteAction(quoteId);
      if (!result.success) {
        setError(result.error ?? "Falha ao excluir.");
        return;
      }
      router.push("/dashboard/orcamentos");
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="h-11 rounded-xl border border-dashed border-danger/40 px-4 text-xs font-medium text-danger"
      >
        Excluir orçamento definitivamente
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-danger/30 bg-danger/5 p-4">
      <p className="text-sm">
        Excluir este orçamento <strong>apaga de verdade</strong>, sem volta. Só funciona se nenhuma OS tiver
        sido criada a partir dele — nesse caso, use "Cancelar".
      </p>
      <div className="flex gap-2">
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="h-10 flex-1 rounded-lg bg-danger text-sm font-semibold text-white disabled:opacity-60"
        >
          {isPending ? "Excluindo…" : "Excluir definitivamente"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="h-10 flex-1 rounded-lg border border-border text-sm font-medium"
        >
          Cancelar
        </button>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
