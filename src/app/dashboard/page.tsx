import { auth } from "@/auth";
import { getDashboardMetricsService } from "@/lib/dashboard/service";
import { formatBRL } from "@/lib/money";

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export default async function DashboardHomePage() {
  const session = await auth();
  const firstName = (session?.user?.name ?? "").split(" ")[0];
  const metrics = await getDashboardMetricsService();

  const monthLabel = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">
          Olá{firstName ? `, ${firstName}` : ""}.
        </h1>
        <p className="text-sm text-muted">Resumo de {monthLabel}.</p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted">Financeiro</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard label="Clientes ativos" value={String(metrics.totalCustomers)} />
          <KpiCard
            label="Faturamento do mês"
            value={formatBRL(metrics.monthlyRevenueCents)}
            hint="Recebimentos líquidos de estorno"
          />
          <KpiCard
            label="Ticket médio"
            value={formatBRL(metrics.averageTicketCents)}
            hint="Faturamento ÷ OS pagas no mês"
          />
          <KpiCard label="Despesas do mês" value={formatBRL(metrics.monthlyExpensesCents)} />
          <KpiCard
            label="Resultado do mês"
            value={formatBRL(metrics.netResultCents)}
            hint="Faturamento − despesas pagas"
          />
          <KpiCard
            label="Despesas pendentes"
            value={formatBRL(metrics.pendingExpensesCents)}
            hint="Ainda não pagas"
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted">Operacional</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="OS em aberto" value={String(metrics.openWorkOrders)} />
          <KpiCard label="Aguardando peça" value={String(metrics.awaitingPartWorkOrders)} />
          <KpiCard label="Entregues no mês" value={String(metrics.deliveredThisMonth)} />
          <KpiCard label="Veículos ativos" value={String(metrics.totalVehicles)} />
        </div>
      </section>
    </div>
  );
}
