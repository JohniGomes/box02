"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatBRL } from "@/lib/money";
import { registerInternalQuoteDecisionAction } from "../actions";

interface DecidableItem {
  id: string;
  description: string;
  typeLabel: string;
  totalCents: number;
}

/**
 * Registro da decisão do cliente feito pela própria oficina (presencial,
 * telefone/WhatsApp ou serviço já realizado) — alternativa ao link público.
 * Todos os itens vêm marcados como aprovados; desmarcar um item o registra
 * como recusado (aprovação parcial).
 */
export function RegisterApprovalForm({
  quoteId,
  items,
  customerName,
}: {
  quoteId: string;
  items: DecidableItem[];
  customerName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [approved, setApproved] = useState<Record<string, boolean>>(
    Object.fromEntries(items.map((i) => [i.id, true])),
  );
  const [approverName, setApproverName] = useState(customerName);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const inputClass =
    "h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

  const approvedTotal = items.filter((i) => approved[i.id]).reduce((sum, i) => sum + i.totalCents, 0);
  const anyApproved = items.some((i) => approved[i.id]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const result = await registerInternalQuoteDecisionAction(quoteId, {
      itemDecisions: items.map((i) => ({ itemId: i.id, decision: approved[i.id] ? "APROVADO" : "RECUSADO" })),
      approverName,
      notes,
    });

    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Não foi possível registrar a aprovação.");
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-12 rounded-xl border border-accent text-base font-semibold text-foreground active:scale-[0.98]"
      >
        Registrar aprovação (sem o link do cliente)
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <div>
        <h2 className="text-sm font-semibold">Registrar aprovação do cliente</h2>
        <p className="mt-1 text-xs text-muted">
          Use quando o cliente aprovou pessoalmente, por telefone/WhatsApp, ou o serviço já foi feito. Desmarque
          os itens que o cliente recusou.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background p-3 text-sm">
              <input
                type="checkbox"
                checked={approved[item.id]}
                onChange={(e) => setApproved((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                className="mt-1 h-5 w-5 shrink-0"
              />
              <span className="flex-1">
                <span className="block text-xs text-muted">{item.typeLabel}</span>
                {item.description}
              </span>
              <span className="font-semibold">{formatBRL(item.totalCents)}</span>
            </label>
          </li>
        ))}
      </ul>

      <div className="flex justify-between text-sm">
        <span className="text-muted">Total aprovado</span>
        <span className="font-semibold">{formatBRL(approvedTotal)}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="approverName">
          Quem aprovou
        </label>
        <input
          id="approverName"
          value={approverName}
          onChange={(e) => setApproverName(e.target.value)}
          className={inputClass}
        />
        {fieldErrors.approverName ? <p className="text-xs text-danger">{fieldErrors.approverName}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="approvalNotes">
          Observação (opcional)
        </label>
        <textarea
          id="approvalNotes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Ex.: aprovado presencialmente na retirada do veículo"
          className="rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={submitting}
          className="h-12 flex-1 rounded-xl border border-border text-base font-medium"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || approverName.trim().length < 2}
          className="h-12 flex-1 rounded-xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50"
        >
          {submitting ? "Registrando…" : anyApproved ? "Registrar aprovação" : "Registrar recusa"}
        </button>
      </div>
    </div>
  );
}
