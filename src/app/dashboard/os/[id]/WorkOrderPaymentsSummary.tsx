import Link from "next/link";
import { formatBRL } from "@/lib/money";
import type { WorkOrderPaymentsSummary } from "@/lib/workOrders/service";

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

/**
 * Resumo do recebimento dentro da OS (só leitura): o pagamento em si é registrado e consultado na ficha da OS
 * em Recebimentos. Custo, markup e dados internos nunca aparecem aqui.
 */
export function WorkOrderPaymentsSummaryCard({ workOrderId, summary }: { workOrderId: string; summary: WorkOrderPaymentsSummary }) {
  const open = summary.remainingCents > 0;
  return (
    <section id="recebimentos" className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-accent">Recebimentos</h2>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[summary.status]}`}>
          {STATUS_LABEL[summary.status]}
        </span>
      </div>
      <dl className={`mb-3 grid gap-2 text-center text-sm ${summary.discountCents > 0 ? "grid-cols-4" : "grid-cols-3"}`}>
        <div>
          <dt className="text-[10px] text-muted">Devido</dt>
          <dd className="font-semibold">{formatBRL(summary.dueCents)}</dd>
        </div>
        <div>
          <dt className="text-[10px] text-muted">Recebido</dt>
          <dd className="font-semibold text-success">{formatBRL(summary.paidCents)}</dd>
        </div>
        {summary.discountCents > 0 ? (
          <div>
            <dt className="text-[10px] text-muted">Desconto</dt>
            <dd className="font-semibold">{formatBRL(summary.discountCents)}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-[10px] text-muted">Saldo</dt>
          <dd className="font-semibold">{formatBRL(summary.remainingCents)}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/dashboard/recebimentos/${workOrderId}`}
          className={
            open
              ? "flex h-11 flex-1 items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground"
              : "flex h-11 flex-1 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold"
          }
        >
          {open ? "Receber agora →" : "Ver pagamentos →"}
        </Link>
        {summary.paidCents > 0 ? (
          <Link href={`/dashboard/os/${workOrderId}/recibo`} className="flex h-11 items-center px-2 text-sm font-medium text-accent">
            Ver recibo →
          </Link>
        ) : null}
      </div>
    </section>
  );
}
