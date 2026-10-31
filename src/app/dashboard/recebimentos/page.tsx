import Link from "next/link";
import { CASH_PERIODS, getCashSummaryService, parseCashPeriod } from "@/lib/finance/cash";
import { getWorkOrderPaymentsSummaryService } from "@/lib/workOrders/service";
import { formatBRL } from "@/lib/money";
import { formatPlate } from "@/lib/validation/plate";
import { formatDateBR, formatDateTimeBR } from "@/lib/dateBr";
import { WorkOrderPaymentsSection } from "../os/[id]/WorkOrderPaymentsSection";
import { toPaymentsSummaryView } from "../os/[id]/paymentsView";

const METHOD_LABEL: Record<string, string> = { DINHEIRO: "Dinheiro", PIX: "Pix", CARTAO: "Cartão", OUTRO: "Outro" };
/** Quantas OS a receber já trazem o formulário de receber pronto; o resto abre pela ficha da OS. */
const INLINE_FORMS = 30;

type SearchParams = { periodo?: string; de?: string; ate?: string; q?: string };

/** Caixa da oficina: busca por OS/cliente/placa, o que falta receber e o que já entrou em qualquer período. */
export default async function RecebimentosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { period, custom } = parseCashPeriod(sp.periodo, sp.de, sp.ate);
  // Com busca e sem período escolhido, o histórico inteiro é o que interessa.
  const searching = (sp.q ?? "").trim().length > 0;
  const effectivePeriod = searching && !sp.periodo && !custom ? "tudo" : period;
  const view = await getCashSummaryService(effectivePeriod, new Date(), { custom, q: sp.q });

  const withForms = await Promise.all(
    view.receivables.slice(0, INLINE_FORMS).map(async (r) => ({ row: r, summary: await getWorkOrderPaymentsSummaryService(r.id) })),
  );
  const rest = view.receivables.slice(INLINE_FORMS);

  const methods = [
    ["Dinheiro", view.byMethod.DINHEIRO],
    ["Pix", view.byMethod.PIX],
    ["Cartão", view.byMethod.CARTAO],
    ["Outro", view.byMethod.OUTRO],
  ] as const;

  const periodHref = (id: string) =>
    `/dashboard/recebimentos?periodo=${id}${view.query ? `&q=${encodeURIComponent(view.query)}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Recebimentos</h1>
        <p className="text-sm text-muted">O caixa da oficina: quem ainda deve e o que já entrou. Para ver lucro e despesas, use o Financeiro.</p>
      </div>

      <form action="/dashboard/recebimentos" className="flex gap-2">
        <input
          name="q"
          defaultValue={view.query}
          placeholder="Buscar por número da OS, cliente ou placa"
          className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 text-sm outline-none focus:border-accent"
        />
        <button type="submit" className="h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground">
          Buscar
        </button>
        {view.query ? (
          <Link href="/dashboard/recebimentos" className="flex h-11 items-center rounded-xl border border-border px-3 text-sm text-muted">
            Limpar
          </Link>
        ) : null}
      </form>

      {view.query ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">
            OS encontradas <span className="text-muted">({view.orders.length})</span>
          </h2>
          {view.orders.length === 0 ? (
            <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
              Nenhuma OS entregue combina com &quot;{view.query}&quot;.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {view.orders.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/dashboard/recebimentos/${o.id}`}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border bg-surface p-3 text-sm hover:border-accent"
                  >
                    <span>
                      <span className="font-mono font-semibold">{o.number}</span> · {o.customerName}
                      <span className="block text-xs text-muted">
                        {o.plate ? `${formatPlate(o.plate)} · ` : ""}
                        {o.deliveredAt ? `entregue em ${formatDateBR(o.deliveredAt)}` : "entrega sem data"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-xs">
                      <span className="block text-muted">
                        Recebido {formatBRL(o.paidCents)} de {formatBRL(o.dueCents)}
                      </span>
                      <span className={`font-semibold ${o.balanceCents > 0 ? "text-danger" : "text-success"}`}>
                        {o.balanceCents > 0 ? `Falta ${formatBRL(o.balanceCents)}` : "Quitado"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">
            A receber <span className="text-muted">({view.receivables.length})</span>
          </h2>
          <span className="text-sm font-semibold">{formatBRL(view.receivablesTotalCents)}</span>
        </div>
        {view.receivables.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">Nenhuma OS entregue com saldo em aberto.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {withForms.map(({ row, summary }) => (
              <li key={row.id} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/dashboard/recebimentos/${row.id}`} className="font-mono text-sm font-semibold hover:underline">
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
                  <Link href={`/dashboard/recebimentos/${row.id}`} className="font-mono font-semibold hover:underline">
                    {row.number}
                  </Link>{" "}
                  · {row.customerName}
                </span>
                <span className="font-semibold">{formatBRL(row.balanceCents)}</span>
              </li>
            ))}
          </ul>
        )}
        {rest.length > 0 ? <p className="text-xs text-muted">Nas OS acima das {INLINE_FORMS} primeiras, abra a ficha para receber.</p> : null}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-sm font-semibold">Recebido</h2>
          {CASH_PERIODS.map((p) => (
            <Link
              key={p.id}
              href={periodHref(p.id)}
              className={`flex h-9 items-center rounded-full border px-3 text-xs font-medium ${
                p.id === view.period ? "border-accent bg-accent/15" : "border-border text-muted"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <form action="/dashboard/recebimentos" className="flex flex-wrap items-end gap-2 text-xs text-muted">
          {view.query ? <input type="hidden" name="q" value={view.query} /> : null}
          <label className="flex flex-col gap-1">
            De
            <input type="date" name="de" defaultValue={custom?.from} required className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-foreground" />
          </label>
          <label className="flex flex-col gap-1">
            Até
            <input type="date" name="ate" defaultValue={custom?.to} required className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-foreground" />
          </label>
          <button type="submit" className="h-9 rounded-lg border border-border px-3 text-sm font-medium text-foreground">
            Ver período
          </button>
        </form>
        <p className="text-xs text-muted">
          {view.label}
          {view.query ? ` · busca: ${view.query}` : ""}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-surface p-5">
            <p className="text-xs font-medium text-muted">Recebido (valor dos serviços)</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{formatBRL(view.totalReceivedCents)}</p>
            <p className="text-xs text-muted">{view.payments.length} recebimento(s)</p>
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
        {view.cardFeePassedCents > 0 || view.refundsCents > 0 ? (
          <p className="text-xs text-muted">
            {view.cardFeePassedCents > 0
              ? `Taxa da maquininha repassada aos clientes: ${formatBRL(view.cardFeePassedCents)} (fora dos valores acima; o cliente passa o serviço mais a taxa no cartão). `
              : ""}
            {view.refundsCents > 0 ? `Estornos no período: ${formatBRL(view.refundsCents)}.` : ""}
          </p>
        ) : null}

        {view.payments.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">Nenhum recebimento neste período.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {view.payments.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-surface p-3 text-sm">
                <div>
                  <Link href={`/dashboard/recebimentos/${p.workOrderId}`} className="font-mono text-xs font-semibold hover:underline">
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
