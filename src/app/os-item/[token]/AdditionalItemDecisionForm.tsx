"use client";

import { useState } from "react";
import { formatBRL } from "@/lib/money";
import { submitAdditionalItemDecisionAction } from "./actions";

const ITEM_TYPE_LABEL: Record<string, string> = {
  SERVICO: "Serviço",
  PECA: "Peça",
  MAO_DE_OBRA: "Mão de obra",
};

export function AdditionalItemDecisionForm({
  token,
  item,
}: {
  token: string;
  item: { type: string; description: string; totalCents: number };
}) {
  const [decision, setDecision] = useState<"APROVADO" | "RECUSADO" | null>(null);
  const [approverName, setApproverName] = useState("");
  const [approverDocument, setApproverDocument] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    if (!decision) return;
    setSubmitting(true);
    setError(null);

    const result = await submitAdditionalItemDecisionAction(token, {
      decision,
      approverName,
      approverDocument: approverDocument || undefined,
      notes: decision === "RECUSADO" ? notes || undefined : undefined,
    });

    setSubmitting(false);

    if (!result.success) {
      setError(result.error ?? "Não foi possível registrar sua decisão.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-success/30 bg-success/5 p-5 text-center">
        <p className="text-base font-semibold text-success">Decisão registrada com sucesso.</p>
        <p className="mt-1 text-sm text-muted">A oficina poderá consultar sua decisão.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="text-xs font-medium text-muted">{ITEM_TYPE_LABEL[item.type] ?? item.type}</p>
        <p className="mt-1 text-sm">{item.description}</p>
        <p className="mt-2 text-lg font-semibold">{formatBRL(item.totalCents)}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setDecision("APROVADO")}
          className={`h-14 rounded-xl border text-sm font-semibold active:scale-[0.98] ${
            decision === "APROVADO" ? "border-success bg-success/15 text-success" : "border-border text-muted"
          }`}
        >
          Aprovar
        </button>
        <button
          type="button"
          onClick={() => setDecision("RECUSADO")}
          className={`h-14 rounded-xl border text-sm font-semibold active:scale-[0.98] ${
            decision === "RECUSADO" ? "border-danger bg-danger/15 text-danger" : "border-border text-muted"
          }`}
        >
          Recusar
        </button>
      </div>

      {decision ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="approverName">Seu nome</label>
            <input
              id="approverName"
              value={approverName}
              onChange={(e) => setApproverName(e.target.value)}
              className="h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              placeholder="Nome completo"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="approverDocument">CPF/CNPJ (opcional)</label>
            <input
              id="approverDocument"
              value={approverDocument}
              onChange={(e) => setApproverDocument(e.target.value)}
              inputMode="numeric"
              className="h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              placeholder="000.000.000-00 ou 00.000.000/0000-00"
            />
          </div>
          {decision === "RECUSADO" ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="notes">Motivo (opcional)</label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-center text-sm text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!decision || !approverName.trim() || submitting}
        className="h-12 rounded-xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50 active:scale-[0.98]"
      >
        {submitting ? "Enviando…" : "Confirmar decisão"}
      </button>
    </div>
  );
}
