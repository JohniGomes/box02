import Link from "next/link";
import { getDashboardMetricsService } from "@/lib/dashboard/service";
import { listAppointmentsWithNamesBetweenService } from "@/lib/appointments/service";
import { formatBRL } from "@/lib/money";
import { CalendarWidget } from "@/components/CalendarWidget";

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function greeting(hour: number): string {
  if (hour < 12) return "bom dia";
  if (hour < 18) return "boa tarde";
  return "boa noite";
}

export default async function DashboardHomePage() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);
  const todayStart = new Date(year, now.getMonth(), now.getDate());
  const todayEnd = new Date(year, now.getMonth(), now.getDate() + 1);

  const [metrics, monthAppointments] = await Promise.all([
    getDashboardMetricsService(),
    listAppointmentsWithNamesBetweenService(monthStart, monthEnd),
  ]);

  const activeMonthAppointments = monthAppointments.filter((a) => a.status === "AGENDADO");
  const appointmentCountByDay: Record<number, number> = {};
  for (const a of activeMonthAppointments) {
    const d = new Date(a.scheduledAt).getDate();
    appointmentCountByDay[d] = (appointmentCountByDay[d] ?? 0) + 1;
  }
  const todayAppointmentsCount = activeMonthAppointments.filter((a) => {
    const t = new Date(a.scheduledAt).getTime();
    return t >= todayStart.getTime() && t < todayEnd.getTime();
  }).length;

  const dateLabel = now.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    weekday: "long",
  });

  const sales = metrics.salesByMethodThisMonth;
  const quotesThisMonthTotal = metrics.quotesThisMonthPending + metrics.quotesThisMonthApproved;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            Olá, Team BOX 02, {greeting(now.getHours())}!
          </h1>
          <p className="text-sm text-muted">Hoje é {dateLabel}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/os/novo"
            className="flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground"
          >
            Nova Venda
          </Link>
          <Link
            href="/dashboard/agendamentos/novo"
            className="flex h-10 items-center rounded-lg border border-border px-4 text-sm font-semibold"
          >
            Novo Agendamento
          </Link>
          <Link
            href="/dashboard/orcamentos/novo"
            className="flex h-10 items-center rounded-lg border border-border px-4 text-sm font-semibold"
          >
            Novo Orçamento
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <CalendarWidget
          year={year}
          month={month}
          today={now.getDate()}
          appointmentCountByDay={appointmentCountByDay}
          todayAppointmentsCount={todayAppointmentsCount}
        />

        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Resumo das vendas</h2>
            <span className="text-xs font-medium text-success">
              {formatBRL(metrics.monthlyRevenueCents)} esse mês
            </span>
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <Row label="Dinheiro" value={formatBRL(sales.dinheiroCents)} />
            <Row label="Pix" value={formatBRL(sales.pixCents)} />
            <Row label="Cartão" value={formatBRL(sales.cartaoCents)} />
            <Row label="Outro" value={formatBRL(sales.outroCents)} />
          </div>
          <div className="mt-3 flex justify-between border-t border-border pt-2 text-sm font-semibold">
            <span>Ticket médio</span>
            <span>{formatBRL(metrics.averageTicketCents)}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold">Resumo financeiro</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-success/10 p-3">
              <p className="text-xs text-muted">Entradas hoje</p>
              <p className="mt-1 text-lg font-semibold text-success">{formatBRL(metrics.todayRevenueCents)}</p>
            </div>
            <div className="rounded-xl bg-danger/10 p-3">
              <p className="text-xs text-muted">Saídas hoje</p>
              <p className="mt-1 text-lg font-semibold text-danger">{formatBRL(metrics.todayExpensesCents)}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2 text-sm">
            <Row label="Resultado do mês" value={formatBRL(metrics.netResultCents)} />
            <Row label="Despesas pendentes" value={formatBRL(metrics.pendingExpensesCents)} />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Orçamentos esse mês</h2>
          <Link href="/dashboard/orcamentos" className="text-xs font-medium text-accent">
            Ver todos →
          </Link>
        </div>
        {quotesThisMonthTotal === 0 ? (
          <p className="text-sm text-muted">Nenhum orçamento criado esse mês ainda.</p>
        ) : (
          <div className="flex gap-6 text-sm">
            <span>
              <span className="font-semibold">{metrics.quotesThisMonthPending}</span>{" "}
              <span className="text-muted">pendentes</span>
            </span>
            <span>
              <span className="font-semibold text-success">{metrics.quotesThisMonthApproved}</span>{" "}
              <span className="text-muted">aprovados</span>
            </span>
          </div>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted">Operacional</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="OS em aberto" value={String(metrics.openWorkOrders)} />
          <KpiCard label="Aguardando peça" value={String(metrics.awaitingPartWorkOrders)} />
          <KpiCard label="Entregues no mês" value={String(metrics.deliveredThisMonth)} />
          <KpiCard label="Clientes ativos" value={String(metrics.totalCustomers)} />
        </div>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted">
      <span>{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
