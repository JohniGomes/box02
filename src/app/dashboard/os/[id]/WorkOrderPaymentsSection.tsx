"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatBRL } from "@/lib/money";
import { registerWorkOrderPaymentAction } from "../paymentActions";

const METHOD_LABEL: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "Pix",
  CARTAO: "Cartão",
  OUTRO: "Outro",
};

const STATUS_LABEL: Record<string, string> = {
  EM_ABERTO: "Em aberto",
  PARCIALMENTE_PAGO: "Parcialmente pago",
  QUITADO: "Quitado",
};

const STATUS_CLASS: Record<string, string> = {
  EM_ABERTO: "bg-danger/15 text-danger",
  PARCIALMENTE_PAGO: "bg-accent/15 text-accent",
  QUITADO: "bg-success/15 text-success",
};

export interface WorkOrderPaymentView {
  id: string;
  amountCents: number;
  method: string;
  notes: string | null;
  receivedAt: string;
}

export interface WorkOrderPaymentsSummaryView {
  dueCents: number;
  paidCents: number;
  remainingCents: number;
  status: "EM_ABERTO" | "PARCIALMENTE_PAGO" | "QUITADO";
  payments: WorkOrderPaymentView[];
}

/**
 * Ciclo I — seção de recebimentos, só visível quando a OS está ENTREGUE
 * (DEC-I9). Custo, markup e qualquer dado de precificação interna nunca
 * aparecem aqui — esta seção só lê o valor já congelado no fechamento
 * (WorkOrderClosure) e os lançamentos já feitos.
 */
export function WorkOrderPaymentsSection({
  workOrderId,
  summary,
}: {
  workOrderId: string;
  summary: WorkOrderPaymentsSummaryView;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [amountReais, setAmountReais] = useState("");
  const [method, setMethod] = useState("DINHEIRO");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRegister() {
    setError(null);
    startTransition(async () => {
      const result = await registerWorkOrderPaymentAction(workOrderId, { amountReais, method, notes: notes || undefined });
      if (!result.success) {
        setError(result.error ?? "Falha ao registrar recebimento.");
        return;
      }
      setAmountReais("");
      setNotes("");
      setShowForm(false);
      router.refresh();
    });
  }

  const inputClass =
    "h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-accent">Recebimentos</h2>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[summary.status]}`}>
          {STATUS_LABEL[summary.status]}
        </span>
      </div>

      <dl className="mb-3 grid grid-cols-3 gap-2 text-center text-sm">
        <div>
          <dt className="text-[10px] text-muted">Devido</dt>
          <dd className="font-semibold">{formatBRL(summary.dueCents)}</dd>
        </div>
        <div>
          <dt className="text-[10px] text-muted">Recebido</dt>
          <dd className="font-semibold text-success">{formatBRL(summary.paidCents)}</dd>
        </div>
        <div>
          <dt className="text-[10px] text-muted">Saldo</dt>
          <dd className="font-semibold">{formatBRL(summary.remainingCents)}</dd>
        </div>
      </dl>

      {summary.payments.length > 0 ? (
        <ul className="mb-3 flex flex-col gap-1.5">
          {summary.payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-xl border border-border bg-background p-2.5 text-sm">
              <div>
                <span className="font-medium">{formatBRL(p.amountCents)}</span>{" "}
                <span className="text-xs text-muted">{METHOD_LABEL[p.method]}</span>
                {p.notes ? <p className="text-xs text-muted">{p.notes}</p> : null}
              </div>
              <span className="text-xs text-muted">{new Date(p.receivedAt).toLocaleDateString("pt-BR")}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-muted">Nenhum recebimento registrado ainda.</p>
      )}

      {summary.status !== "QUITADO" ? (
        !showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="h-11 w-full rounded-xl border border-border text-sm font-semibold"
          >
            Registrar recebimento
          </button>
        ) : (
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
            <input
              value={amountReais}
              onChange={(e) => setAmountReais(e.target.value)}
              inputMode="decimal"
              placeholder={`Valor — saldo restante ${formatBRL(summary.remainingCents)}`}
              className={inputClass}
            />
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputClass}>
              {Object.entries(METHOD_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observação (opcional)"
              className={inputClass}
            />
            {error ? <p className="text-xs text-danger">{error}</p> : null}
            <div className="flex gap-2">
              <button
                onClick={handleRegister}
                disabled={isPending || !amountReais.trim()}
                className="h-11 flex-1 rounded-xl bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                {isPending ? "Registrando…" : "Confirmar"}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="h-11 flex-1 rounded-xl border border-border text-sm font-semibold"
              >
                Cancelar
              </button>
            </div>
          </div>
        )
      ) : null}
    </section>
  );
}
