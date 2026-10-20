import Link from "next/link";
import { getHomeAlerts } from "@/lib/db/repositories/homeAlerts";
import { formatBRL } from "@/lib/money";

function AlertCard({
  title,
  href,
  tone,
  children,
}: {
  title: string;
  href: string;
  tone: "alert" | "ok";
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col gap-1 rounded-2xl border p-4 text-sm active:scale-[0.99] ${
        tone === "alert" ? "border-accent/50 bg-accent/5" : "border-border bg-surface"
      }`}
    >
      <span className="text-xs font-medium text-muted">{title}</span>
      {children}
    </Link>
  );
}

/**
 * "O que está esperando alguém": solicitações novas, contas vencidas ou
 * perto de vencer, estoque zerado/baixo e pendências de termo/checklist das
 * OS. Cada cartão leva direto à tela onde se resolve.
 */
export async function HomeAlerts() {
  const a = await getHomeAlerts();
  const { expenses, stock, workOrderPending: wo } = a;

  const expensesAlert = expenses.overdueCount > 0 || expenses.dueSoonCount > 0;
  const stockAlert = stock.outOfStock > 0 || stock.belowMinimum > 0;
  const woPendingTotal = wo.withoutReception + wo.withoutEntryChecklist + wo.withoutDeliveryChecklist;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-muted">Precisa de atenção</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AlertCard title="Solicitações pendentes" href="/dashboard/solicitacoes" tone={a.pendingServiceRequests > 0 ? "alert" : "ok"}>
          <span className="text-2xl font-semibold tracking-tight">{a.pendingServiceRequests}</span>
          <span className="text-xs text-muted">
            {a.pendingServiceRequests === 0 ? "Nenhum pedido esperando resposta." : "Clientes esperando resposta."}
          </span>
        </AlertCard>

        <AlertCard title="Contas a pagar" href="/dashboard/despesas" tone={expensesAlert ? "alert" : "ok"}>
          {expensesAlert ? (
            <>
              {expenses.overdueCount > 0 ? (
                <span className="font-semibold text-danger">
                  {expenses.overdueCount} {expenses.overdueCount === 1 ? "vencida" : "vencidas"} ·{" "}
                  {formatBRL(expenses.overdueCents)}
                </span>
              ) : null}
              {expenses.dueSoonCount > 0 ? (
                <span className="font-semibold">
                  {expenses.dueSoonCount} {expenses.dueSoonCount === 1 ? "vence" : "vencem"} em 7 dias ·{" "}
                  {formatBRL(expenses.dueSoonCents)}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-xs text-muted">Nada vencido nem vencendo nos próximos 7 dias.</span>
          )}
        </AlertCard>

        <AlertCard title="Estoque" href="/dashboard/estoque" tone={stockAlert ? "alert" : "ok"}>
          {stock.activeParts === 0 ? (
            <span className="text-xs text-muted">Nenhuma peça cadastrada.</span>
          ) : (
            <>
              <span className="font-semibold">
                {stock.outOfStock} {stock.outOfStock === 1 ? "zerada" : "zeradas"}
                {stock.belowMinimum > 0 ? ` · ${stock.belowMinimum} abaixo do mínimo` : ""}
              </span>
              <span className="text-xs text-muted">
                {stock.activeParts} {stock.activeParts === 1 ? "peça" : "peças"} · {formatBRL(stock.valueCents)} em
                estoque (custo)
              </span>
            </>
          )}
        </AlertCard>

        <AlertCard title="Pendências das OS (60 dias)" href="/dashboard/os" tone={woPendingTotal > 0 ? "alert" : "ok"}>
          {woPendingTotal === 0 ? (
            <span className="text-xs text-muted">Termos e checklists em dia.</span>
          ) : (
            <>
              {wo.withoutReception > 0 ? <span className="font-semibold">{wo.withoutReception} sem termo aceito</span> : null}
              {wo.withoutEntryChecklist > 0 ? (
                <span className="text-xs text-muted">{wo.withoutEntryChecklist} sem checklist de entrada</span>
              ) : null}
              {wo.withoutDeliveryChecklist > 0 ? (
                <span className="text-xs text-muted">{wo.withoutDeliveryChecklist} sem checklist de entrega</span>
              ) : null}
            </>
          )}
        </AlertCard>
      </div>
    </section>
  );
}
