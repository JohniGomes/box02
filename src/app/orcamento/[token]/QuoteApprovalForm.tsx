"use client";

import { useState } from "react";
import { formatBRL } from "@/lib/money";
import { submitQuoteDecisionAction } from "./actions";

type ItemDecision = "APROVADO" | "RECUSADO" | null;
type ItemCategory = "NECESSARIO" | "RECOMENDADO" | "INFORMATIVO";

interface ItemForApproval {
  id: string;
  type: "SERVICO" | "PECA" | "MAO_DE_OBRA";
  description: string;
  totalCents: number;
  category: ItemCategory;
}

const ITEM_TYPE_LABEL: Record<string, string> = {
  SERVICO: "Serviço",
  PECA: "Peça",
  MAO_DE_OBRA: "Mão de obra",
};

export function QuoteApprovalForm({ token, items }: { token: string; items: ItemForApproval[] }) {
  // Só itens decidíveis (NECESSARIO/RECOMENDADO) entram no estado de
  // decisão — INFORMATIVO nunca é decidido, nem no cliente nem no
  // servidor (que rejeitaria de qualquer forma se fosse enviado).
  const decidableItems = items.filter((i) => i.category !== "INFORMATIVO");
  const necessarios = items.filter((i) => i.category === "NECESSARIO");
  const recomendados = items.filter((i) => i.category === "RECOMENDADO");
  const informativos = items.filter((i) => i.category === "INFORMATIVO");

  const [decisions, setDecisions] = useState<Record<string, ItemDecision>>(
    Object.fromEntries(decidableItems.map((i) => [i.id, null])),
  );
  const [approverName, setApproverName] = useState("");
  const [approverDocument, setApproverDocument] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const allDecided = decidableItems.every((i) => decisions[i.id] !== null);
  const hasAnyRejection = decidableItems.some((i) => decisions[i.id] === "RECUSADO");
  const approvedTotal = decidableItems
    .filter((i) => decisions[i.id] === "APROVADO")
    .reduce((sum, i) => sum + i.totalCents, 0);
  const informativeTotal = informativos.reduce((sum, i) => sum + i.totalCents, 0);
  const totalAutorizavel = decidableItems.reduce((sum, i) => sum + i.totalCents, 0);

  function setAll(decision: ItemDecision) {
    setDecisions(Object.fromEntries(decidableItems.map((i) => [i.id, decision])));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    const result = await submitQuoteDecisionAction(token, {
      itemDecisions: decidableItems.map((i) => ({
        itemId: i.id,
        decision: decisions[i.id] as "APROVADO" | "RECUSADO",
      })),
      approverName,
      approverDocument: approverDocument || undefined,
      reason: hasAnyRejection ? reason || undefined : undefined,
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
    <div className="flex flex-col gap-5">
      {decidableItems.length > 0 ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAll("APROVADO")}
            className="h-11 flex-1 rounded-xl bg-success/15 text-sm font-semibold text-success active:scale-[0.98]"
          >
            Aprovar necessário + recomendado
          </button>
          <button
            type="button"
            onClick={() => setAll("RECUSADO")}
            className="h-11 flex-1 rounded-xl bg-danger/15 text-sm font-semibold text-danger active:scale-[0.98]"
          >
            Recusar todos
          </button>
        </div>
      ) : null}

      {necessarios.length > 0 ? (
        <ItemSection
          title="Necessário"
          description="Corrige o problema identificado — precisa da sua decisão."
          accentClass="border-danger/40 bg-danger/5"
          badgeClass="bg-danger/15 text-danger"
          items={necessarios}
          decisions={decisions}
          setDecisions={setDecisions}
        />
      ) : null}

      {recomendados.length > 0 ? (
        <ItemSection
          title="Recomendado"
          description="Desgaste ou atenção — não impede o necessário, mas vale considerar."
          accentClass="border-accent/40 bg-accent/5"
          badgeClass="bg-accent/15 text-foreground"
          items={recomendados}
          decisions={decisions}
          setDecisions={setDecisions}
        />
      ) : null}

      {informativos.length > 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <h3 className="text-sm font-semibold">Informativo</h3>
          <p className="mt-0.5 text-xs text-muted">
            Só para você saber — não precisa aprovar nem recusar, e nunca é cobrado agora.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {informativos.map((item) => (
              <li key={item.id} className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted">{ITEM_TYPE_LABEL[item.type]}</span>
                  {item.totalCents > 0 ? (
                    <span className="text-xs text-muted">
                      valor estimado: {formatBRL(item.totalCents)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm">{item.description}</p>
              </li>
            ))}
          </ul>
          {informativeTotal > 0 ? (
            <p className="mt-3 text-xs text-muted">
              Valor estimado informativo: {formatBRL(informativeTotal)} — não entra no total cobrável.
            </p>
          ) : null}
        </div>
      ) : null}

      {decidableItems.length > 0 ? (
        <div className="rounded-xl bg-background p-4 text-sm">
          <div className="flex justify-between text-muted">
            <span>Total autorizável (necessário + recomendado)</span>
            <span>{formatBRL(totalAutorizavel)}</span>
          </div>
          <div className="mt-1 flex justify-between font-semibold">
            <span>Total aprovado até agora</span>
            <span>{formatBRL(approvedTotal)}</span>
          </div>
        </div>
      ) : null}

      {decidableItems.length === 0 ? (
        <p className="text-center text-sm text-muted">
          Este orçamento tem só itens informativos — nenhuma decisão é necessária.
        </p>
      ) : allDecided ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="approverName">
              Seu nome
            </label>
            <input
              id="approverName"
              value={approverName}
              onChange={(e) => setApproverName(e.target.value)}
              className="h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              placeholder="Nome completo"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="approverDocument">
              CPF/CNPJ (opcional)
            </label>
            <input
              id="approverDocument"
              value={approverDocument}
              onChange={(e) => setApproverDocument(e.target.value)}
              inputMode="numeric"
              className="h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              placeholder="000.000.000-00 ou 00.000.000/0000-00"
            />
          </div>
          {hasAnyRejection ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="reason">
                Motivo da recusa (opcional)
              </label>
              <textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-center text-sm text-muted">
          Decida os itens necessário/recomendado acima para confirmar.
        </p>
      )}

      {error ? (
        <p role="alert" className="text-center text-sm text-danger">
          {error}
        </p>
      ) : null}

      {decidableItems.length > 0 ? (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!allDecided || !approverName.trim() || submitting}
          className="h-12 rounded-xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50 active:scale-[0.98]"
        >
          {submitting ? "Enviando…" : "Confirmar decisão"}
        </button>
      ) : null}
    </div>
  );
}

function ItemSection({
  title,
  description,
  accentClass,
  badgeClass,
  items,
  decisions,
  setDecisions,
}: {
  title: string;
  description: string;
  accentClass: string;
  badgeClass: string;
  items: ItemForApproval[];
  decisions: Record<string, ItemDecision>;
  setDecisions: React.Dispatch<React.SetStateAction<Record<string, ItemDecision>>>;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${accentClass}`}>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-0.5 text-xs text-muted">{description}</p>
      <ul className="mt-3 flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeClass}`}>
                {ITEM_TYPE_LABEL[item.type]}
              </span>
              <span className="text-sm font-semibold">{formatBRL(item.totalCents)}</span>
            </div>
            <p className="mt-1 text-sm">{item.description}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDecisions((prev) => ({ ...prev, [item.id]: "APROVADO" }))}
                className={`h-11 rounded-xl border text-sm font-semibold active:scale-[0.98] ${
                  decisions[item.id] === "APROVADO"
                    ? "border-success bg-success/15 text-success"
                    : "border-border text-muted"
                }`}
              >
                Aprovar
              </button>
              <button
                type="button"
                onClick={() => setDecisions((prev) => ({ ...prev, [item.id]: "RECUSADO" }))}
                className={`h-11 rounded-xl border text-sm font-semibold active:scale-[0.98] ${
                  decisions[item.id] === "RECUSADO"
                    ? "border-danger bg-danger/15 text-danger"
                    : "border-border text-muted"
                }`}
              >
                Recusar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
