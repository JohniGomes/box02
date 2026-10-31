import Link from "next/link";
import { CASH_PERIODS, getCashSummaryService, parseCashPeriod } from "@/lib/finance/cash";
import { getWorkOrderPaymentsSummaryService } from "@/lib/workOrders/service";
import { formatBRL } from "@/lib/money";
import { formatPlate } from "@/lib/validation/plate";
import { formatDateBR, formatDateTimeBR } from "@/lib/dateBr";
import { WorkOrderPaymentsSection } from "../os/[id]/WorkOrderPaymentsSection";
import { toPaymentsSummaryView } from "../os/[id]/paymentsView";

const METHOD_LABEL: Record<string, string> = { DINHEIRO: "Dinheiro", PIX: "Pix", CARTAO: "Cartão", OUTRO: "Outro" };
/** Quantas OS a receber já trazem o formulário de receber pronto; o resto abre pela própria OS. */
const INLINE_FORMS = 30;

/** Caixa da oficina: o que falta receber (com o formulário de receber ali mesmo) e o que já entrou. */
export default async function RecebimentosPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const period = parseCashPeriod((await searchParams).periodo);
  const cash = await getCashSummaryService(period);

  const withForms = await Promise.all(
    cash.receivables.slice(0, INLINE_FORMS).map(async (r) => ({ row: r, summary: await getWorkOrderPaymentsSummaryService(r.id) })),
  );
  const rest = cash.receivables.slice(INLINE_FORMS);

  const methods = [
    ["Dinheiro", cash.byMethod.DINHEIRO],
    ["Pix", cash.byMethod.PIX],
    ["Cartão", cash.byMethod.CARTAO],
    ["Outro", cash.byMethod.OUTRO],
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Recebimentos</h1>
        <p className="text-sm text-muted">O caixa da oficina: quem ainda deve e o que já entrou. Para ver lucro e despesas, use o Financeiro.</p>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">
            A receber <span className="text-muted">({cash.receivables.length})</span>
          </h2>
          <span className="text-sm font-semibold">{formatBRL(cash.receivablesTotalCents)}</span>
        </div>
        {cash.receivables.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">Nenhuma OS entregue com saldo em aberto.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {withForms.map(({ row, summary }) => (
              <li key={row.id} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/dashboard/os/${row.id}/detalhes`} className="font-mono text-sm font-semibold hover:underline">
                      {row.number}
                    </Link>
                    <p className="text-sm">{row.customerName}</p>
                    <p className="text-xs text-muted">
                      {row.plate ? `${formatPlate(row.plate)} · ` : ""}
                      {row.deliveredAt ? `entregue em ${formatDateBR(row.deliveredAt)}` : "entrega sem data"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted">Saldo</p>
                    <p className="text-base font-semibold">{formatBRL(row.balanceCents)}</p>
                    <p className="text-[11px] text-muted">de {formatBRL(row.dueCents)}</p>
                  </div>
                </div>
                {summary ? (
                  <details className="mt-3">
                    <summary className="flex h-11 cursor-pointer items-center justify-center rounded-xl bg-accent text-sm font-semibold text-accent-foreground">
                      Receber
                    </summary>
                    <div className="mt-3">
                      <WorkOrderPaymentsSection
                        workOrderId={row.id}
                        sectionId={`recebimentos-${row.id}`}
                        summary={toPaymentsSummaryView(summary)}
                      />
                    </div>
                  </details>
                ) : null}
              </li>
            ))}
            {rest.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 text-sm">
                <span>
                  <Link href={`/dashboard/os/${row.id}/detalhes`} className="font-mono font-semibold hover:underline">
                    {row.number}
                  </Link>{" "}
                  · {row.customerName}
                </span>
                <span className="font-semibold">{formatBRL(row.balanceCents)}</span>
              </li>
            ))}
          </ul>
        )}
        {rest.length > 0 ? <p className="text-xs text-muted">Para as OS acima da lista de {INLINE_FORMS}, abra a OS e receba por lá.</p> : null}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-sm font-semibold">Recebido</h2>
          {CASH_PERIODS.map((p) => (
            <Link
              key={p.id}
              href={`/dashboard/recebimentos?periodo=${p.id}`}
              className={`flex h-9 items-center rounded-full border px-3 text-xs font-medium ${
                p.id === period ? "border-accent bg-accent/15" : "border-border text-muted"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <p className="text-xs text-muted">{cash.label}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-surface p-5">
            <p className="text-xs font-medium text-muted">Recebido (valor dos serviços)</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{formatBRL(cash.totalReceivedCents)}</p>
            <p className="text-xs text-muted">{cash.payments.length} recebimento(s)</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-5">
            <p className="mb-2 text-xs font-medium text-muted">Por forma de pagamento</p>
            <ul className="flex flex-col gap-1 text-sm">
              {methods.map(([name, cents]) => (
                <li key={name} className="flex justify-between">
                  <span className="text-muted">{name}</span>
                  <span className="font-medium">{formatBRL(cents)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        {cash.cardFeePassedCents > 0 || cash.refundsCents > 0 ? (
          <p className="text-xs text-muted">
            {cash.cardFeePassedCents > 0
              ? `Taxa da maquininha repassada aos clientes: ${formatBRL(cash.cardFeePassedCents)} (fora dos valores acima; o cliente passa o serviço mais a taxa no cartão). `
              : ""}
            {cash.refundsCents > 0 ? `Estornos no período: ${formatBRL(cash.refundsCents)}.` : ""}
          </p>
        ) : null}

        {cash.payments.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">Nenhum recebimento neste período.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {cash.payments.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-surface p-3 text-sm">
                <div>
                  <Link href={`/dashboard/os/${p.workOrderId}/detalhes`} className="font-mono text-xs font-semibold hover:underline">
                    {p.number}
                  </Link>{" "}
                  <span className="font-medium">{p.customerName}</span>
                  <p className="text-xs text-muted">
                    {formatDateTimeBR(p.receivedAt)} · {METHOD_LABEL[p.method] ?? p.method}
                    {p.plate ? ` · ${formatPlate(p.plate)}` : ""}
                  </p>
                  {p.cardFeeCents != null ? (
                    <p className="text-xs text-muted">
                      Cliente passou {formatBRL(p.amountCents + p.cardFeeCents)} no cartão{p.installments ? ` em ${p.installments}x` : ""} · taxa{" "}
                      {formatBRL(p.cardFeeCents)}
                    </p>
                  ) : p.installments ? (
                    <p className="text-xs text-muted">{p.installments}x no cartão</p>
                  ) : null}
                  {p.refundedCents > 0 ? <p className="text-xs text-danger">Estornado: {formatBRL(p.refundedCents)}</p> : null}
                </div>
                <span className="shrink-0 font-semibold">{formatBRL(p.amountCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
