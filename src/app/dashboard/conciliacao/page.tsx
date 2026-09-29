import { listReconciliationEntriesService } from "@/lib/reconciliation/service";
import { ConciliacaoClient } from "./ConciliacaoClient";

function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default async function ConciliacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const defaultRange = currentMonthRange();
  const from = params.from || defaultRange.from;
  const to = params.to || defaultRange.to;

  const summary = await listReconciliationEntriesService({ from, to });

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold tracking-tight">Conciliação bancária</h1>
      <p className="text-sm text-muted">
        Conferência manual dos recebimentos e despesas pagas contra o extrato do banco. Marcar como conciliado não
        altera o lançamento original — é só uma confirmação separada, que pode ser desfeita.
      </p>
      <ConciliacaoClient from={from} to={to} entries={summary.entries} reconciledCents={summary.reconciledCents} pendingCents={summary.pendingCents} />
    </div>
  );
}
