import Link from "next/link";
import { getMonthFinanceService, type MonthFinance } from "@/lib/finance/service";
import { currentMonthBr, monthLabel, parseMonth, percentChange, shiftMonth } from "@/lib/finance/month";
import { listReceivablesService } from "@/lib/workOrders/service";
import { formatBRL } from "@/lib/money";

const CATEGORY_LABEL: Record<string, string> = {
  ALUGUEL: "Aluguel",
  SALARIOS: "Salários/Pró-labore",
  FORNECEDORES: "Fornecedores/Peças",
  IMPOSTOS: "Impostos",
  MANUTENCAO_EQUIPAMENTOS: "Manutenção de equipamentos",
  UTILIDADES: "Utilidades (água/luz/internet)",
  MARKETING: "Marketing",
  OUTROS: "Outros",
};

function Delta({ current, previous, goodWhenUp = true }: { current: number; previous: number; goodWhenUp?: boolean }) {
  const pct = percentChange(current, previous);
  if (pct === null) return <span className="text-xs text-muted">sem base no mês anterior</span>;
  if (pct === 0) return <span className="text-xs text-muted">igual ao mês anterior</span>;
  const up = pct > 0;
  const good = up === goodWhenUp;
  return (
    <span className={`text-xs font-medium ${good ? "text-success" : "text-danger"}`}>
      {up ? "+" : ""}
      {pct}% vs mês anterior
    </span>
  );
}

function Card({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Cards({ cur, prev }: { cur: MonthFinance; prev: MonthFinance }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Card label="Entradas" value={formatBRL(cur.revenueCents)}>
        <Delta current={cur.revenueCents} previous={prev.revenueCents} />
        {cur.refundsCents > 0 ? <p className="text-xs text-muted">já descontados {formatBRL(cur.refundsCents)} de estornos</p> : null}
      </Card>
      <Card label="Saídas pagas" value={formatBRL(cur.expensesCents)}>
        <Delta current={cur.expensesCents} previous={prev.expensesCents} goodWhenUp={false} />
      </Card>
      <Card label="Resultado do mês" value={formatBRL(cur.resultCents)}>
        <Delta current={cur.resultCents} previous={prev.resultCents} />
      </Card>
      <Card label="Resultado antes do pró-labore" value={formatBRL(cur.resultBeforeProLaboreCents)}>
        <Delta current={cur.resultBeforeProLaboreCents} previous={prev.resultBeforeProLaboreCents} />
        <p className="text-xs text-muted">pró-labore pago: {formatBRL(cur.proLaboreCents)}</p>
      </Card>
    </div>
  );
}

export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const month = parseMonth((await searchParams).mes);
  const [{ current: cur, previous: prev }, receivables] = await Promise.all([getMonthFinanceService(month), listReceivablesService()]);
  const receivableTotal = receivables.reduce((sum, r) => sum + r.balanceCents, 0);
  const isCurrent = month === currentMonthBr();
  const totalOut = cur.expensesCents;
  const methods = [
    ["Dinheiro", cur.byMethod.dinheiroCents],
    ["Pix", cur.byMethod.pixCents],
    ["Cartão", cur.byMethod.cartaoCents],
    ["Outro", cur.byMethod.outroCents],
  ] as const;
  const navClass = "flex h-10 items-center rounded-xl border border-border px-3 text-sm font-medium";

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold tracking-tight">Financeiro</h1>

      <div className="flex items-center justify-between gap-2">
        <Link href={`/dashboard/financeiro?mes=${shiftMonth(month, -1)}`} className={navClass} aria-label="Mês anterior">
          ← Anterior
        </Link>
        <p className="text-center text-sm font-semibold first-letter:uppercase">{monthLabel(month)}</p>
        {isCurrent ? (
          <span className={`${navClass} opacity-40`} aria-disabled>
            Próximo →
          </span>
        ) : (
          <Link href={`/dashboard/financeiro?mes=${shiftMonth(month, 1)}`} className={navClass} aria-label="Próximo mês">
            Próximo →
          </Link>
        )}
      </div>

      <Cards cur={cur} prev={prev} />

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-2 text-sm font-semibold">Entradas por forma de pagamento</h2>
        <ul className="flex flex-col gap-1.5 text-sm">
          {methods.map(([name, cents]) => (
            <li key={name} className="flex justify-between">
              <span className="text-muted">{name}</span>
              <span className="font-medium">{formatBRL(cents)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-2 text-sm font-semibold">Saídas por categoria</h2>
        {cur.expensesByCategory.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma despesa paga neste mês.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {cur.expensesByCategory.map((c) => {
              const pct = totalOut > 0 ? Math.round((c.cents / totalOut) * 100) : 0;
              return (
                <li key={c.category}>
                  <div className="flex justify-between gap-2">
                    <span>{CATEGORY_LABEL[c.category] ?? c.category}</span>
                    <span className="font-medium">
                      {formatBRL(c.cents)} <span className="text-xs font-normal text-muted">({pct}%)</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-background">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-2 text-sm font-semibold">A pagar e a receber</h2>
        <ul className="flex flex-col gap-1.5 text-sm">
          <li className="flex justify-between">
            <span className="text-muted">
              A pagar com vencimento neste mês ({cur.unpaidDueCount} {cur.unpaidDueCount === 1 ? "conta" : "contas"})
            </span>
            <span className="font-medium">{formatBRL(cur.unpaidDueCents)}</span>
          </li>
          <li className="flex justify-between">
            <span className="text-muted">
              A receber agora ({receivables.length} {receivables.length === 1 ? "OS" : "OS"}) — não depende do mês
            </span>
            <span className="font-medium">{formatBRL(receivableTotal)}</span>
          </li>
        </ul>
        <div className="mt-3 flex gap-2 text-sm">
          <Link href="/dashboard/despesas" className="underline">
            Ver despesas
          </Link>
        </div>
      </section>

      <p className="text-xs text-muted">
        Visão de caixa simples: entradas = pagamentos recebidos no mês (menos estornos); saídas = despesas pagas no mês. Não substitui contabilidade.
      </p>
    </div>
  );
}
