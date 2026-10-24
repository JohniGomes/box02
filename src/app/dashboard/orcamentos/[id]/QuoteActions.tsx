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

export interface CancelImpactView {
  number: string;
  status: string;
  paidLabel: string;
  paidCents: number;
  executedItems: number;
}

export function CancelQuoteButton({
  quoteId,
  approved,
  impact,
}: {
  quoteId: string;
  /** Orçamento já aprovado: o motivo é obrigatório. */
  approved: boolean;
  impact: CancelImpactView[];
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await cancelQuoteVersionAction(quoteId, reason);
      if (!result.success) {
        setError(result.error ?? "Não foi possível cancelar.");
        return;
      }
      router.refresh();
    });
  }

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

  const hasMoney = impact.some((o) => o.paidCents > 0);
  const hasStock = impact.some((o) => o.executedItems > 0);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-danger/30 bg-danger/5 p-4">
      <p className="text-sm">
        Cancelar o orçamento <strong>inteiro</strong>? Ele fica registrado no histórico com o motivo, só não segue mais em
        andamento. (Para descartar só a versão nova e voltar para a anterior, use o outro botão.)
      </p>
      {impact.length > 0 ? (
        <div className="rounded-lg border border-border bg-background p-3 text-xs">
          <p className="font-semibold">Este orçamento já tem OS:</p>
          <ul className="mt-1 flex flex-col gap-1">
            {impact.map((o) => (
              <li key={o.number}>
                {o.number} — {o.status}
                {o.paidCents > 0 ? ` · recebido ${o.paidLabel}` : ""}
                {o.executedItems > 0 ? ` · ${o.executedItems} item(ns) já executado(s)` : ""}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            <strong>Cancelar o orçamento não desfaz nada na OS:</strong> a OS continua existindo
            {hasMoney ? ", os pagamentos recebidos continuam registrados" : ""}
            {hasStock ? " e as baixas de estoque continuam" : ""}. Se precisar mexer nisso, reabra ou cancele a OS antes,
            pela própria OS.
          </p>
        </div>
      ) : null}
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder={approved ? "Motivo (obrigatório)" : "Motivo (opcional)"}
        className="rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-accent"
      />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <button
          onClick={run}
          disabled={isPending || (approved && reason.trim().length < 3)}
          className="h-11 flex-1 rounded-xl bg-danger text-sm font-semibold text-white disabled:opacity-50"
        >
          {isPending ? "Cancelando…" : "Confirmar cancelamento"}
        </button>
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
  const [typed, setTyped] = useState("");

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteQuoteAction(quoteId, typed);
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
        Excluir este orçamento <strong>apaga de verdade</strong>, sem volta, e não fica nada no histórico. Só funciona
        se nenhuma OS tiver sido criada a partir dele. Prefira &quot;Cancelar orçamento inteiro&quot;. Para excluir
        mesmo assim, digite <strong>EXCLUIR</strong>:
      </p>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
        placeholder="EXCLUIR"
      />
      <div className="flex gap-2">
        <button
          onClick={handleDelete}
          disabled={isPending || typed.trim().toUpperCase() !== "EXCLUIR"}
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
