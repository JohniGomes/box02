"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { correctServiceDateAction, reopenWorkOrderAction } from "../actions";
import { formatBRL } from "@/lib/money";

export interface CorrectionEntryView {
  id: string;
  kind: "DATA" | "REABERTURA";
  at: string;
  by: string | null;
  reason: string | null;
  from: string | null;
  to: string | null;
}

const inputClass =
  "h-11 rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

/**
 * Correções de uma OS já entregue: trocar a data do atendimento e reabrir a OS.
 * Sempre com motivo; o que mudou fica no histórico. Não apaga pagamento nem
 * baixa de estoque.
 */
export function WorkOrderCorrections({
  workOrderId,
  delivered,
  paidCents,
  paymentCount,
  history,
}: {
  workOrderId: string;
  /** Só uma OS entregue mostra os botões; o histórico aparece sempre que houver. */
  delivered: boolean;
  paidCents: number;
  paymentCount: number;
  history: CorrectionEntryView[];
}) {
  const router = useRouter();
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const [mode, setMode] = useState<null | "date" | "reopen">(null);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function close() {
    setMode(null);
    setReason("");
    setTime("");
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result =
        mode === "date"
          ? await correctServiceDateAction(workOrderId, { serviceDate: date, serviceTime: time || undefined, reason })
          : await reopenWorkOrderAction(workOrderId, reason);
      if (!result.success) {
        setError(result.error ?? "Não foi possível salvar a correção.");
        return;
      }
      close();
      router.refresh();
    });
  }

  if (!delivered && history.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 print:hidden">
      <h2 className="text-sm font-semibold">Correções desta OS</h2>

      {delivered ? (
        <>
          {mode === null ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMode("date")}
                className="h-10 rounded-lg border border-border px-4 text-sm font-medium"
              >
                Corrigir data de atendimento
              </button>
              <button
                type="button"
                onClick={() => setMode("reopen")}
                className="h-10 rounded-lg border border-border px-4 text-sm font-medium"
              >
                Reabrir OS
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-4">
              {mode === "date" ? (
                <>
                  <p className="text-sm font-medium">Corrigir data de atendimento</p>
                  <p className="text-xs text-muted">
                    Muda só a data da entrega. Pagamentos, itens e estoque ficam como estão. O que mudou fica registrado.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
                    <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
                  </div>
                  <p className="text-xs text-muted">
                    Horário é opcional: sem ele, hoje vale a hora de agora e outro dia vale 12:00.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">Reabrir OS</p>
                  <p className="text-xs">
                    A OS volta para <strong>Pronta</strong> e poderá ser ajustada, cancelada ou entregue de novo.{" "}
                    <strong>Nada é apagado:</strong> os pagamentos já recebidos
                    {paymentCount > 0 ? ` (${formatBRL(paidCents)} em ${paymentCount} lançamento${paymentCount > 1 ? "s" : ""})` : ""}{" "}
                    e as baixas de estoque continuam. Se o total mudar na nova entrega, o saldo é recalculado.
                  </p>
                </>
              )}
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Motivo (obrigatório)"
                className="rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-accent"
              />
              {error ? <p className="text-xs text-danger">{error}</p> : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={submit}
                  disabled={isPending || reason.trim().length < 3 || (mode === "date" && !date)}
                  className="h-10 flex-1 rounded-lg bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-50"
                >
                  {isPending ? "Salvando…" : mode === "date" ? "Corrigir data" : "Reabrir OS"}
                </button>
                <button type="button" onClick={close} className="h-10 flex-1 rounded-lg border border-border text-sm">
                  Voltar
                </button>
              </div>
            </div>
          )}
        </>
      ) : null}

      {history.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Histórico</p>
          <ul className="flex flex-col gap-2">
            {history.map((h) => (
              <li key={h.id} className="rounded-xl border border-border bg-background p-3 text-xs">
                <p className="font-medium">
                  {h.kind === "DATA" ? "Data de atendimento corrigida" : "OS reaberta"} —{" "}
                  {new Date(h.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  {h.by ? ` · ${h.by}` : ""}
                </p>
                <p className="text-muted">
                  {h.from ?? "—"} → {h.to ?? "—"}
                </p>
                {h.reason ? <p>Motivo: {h.reason}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
