import Link from "next/link";
import { listChecklistOverview, type ChecklistProgress } from "@/lib/db/repositories/checklistOverview";
import { formatPlate } from "@/lib/validation/plate";
import { WORK_ORDER_STATUS_LABEL } from "../os/statusLabels";
import type { WorkOrderStatus } from "@/lib/db/repositories/workOrders";

function chipState(p: ChecklistProgress): { text: string; className: string } {
  if (p.completed) return { text: "Concluído", className: "bg-success/15 text-success" };
  if (p.started) return { text: `${p.checked}/${p.total}`, className: "bg-accent/15 text-foreground" };
  return { text: "Não iniciado", className: "bg-muted/20 text-muted" };
}

function Chip({ label, href, progress, relevant }: { label: string; href: string; progress: ChecklistProgress; relevant: boolean }) {
  const s = chipState(progress);
  return (
    <Link
      href={href}
      className={`flex h-14 flex-1 flex-col items-center justify-center rounded-xl border text-center active:scale-[0.98] ${
        progress.completed ? "border-border" : relevant ? "border-accent/60" : "border-border"
      }`}
    >
      <span className="text-[11px] text-muted">{label}</span>
      <span className={`mt-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${s.className}`}>{s.text}</span>
    </Link>
  );
}

/**
 * Aba Checklists, pensada para o celular: lista só o que está pendente (entrada
 * ainda não concluída, ou entrega pendente de OS pronta/entregue). Toque no
 * quadro para abrir o checklist e marcar os itens, sem entrar na ficha da OS.
 */
export default async function ChecklistsPage({
  searchParams,
}: {
  searchParams: Promise<{ todas?: string }>;
}) {
  const { todas } = await searchParams;
  const showAll = todas === "1";
  const rows = await listChecklistOverview();

  const items = rows.map((r) => {
    const deliveryRelevant = r.status === "PRONTA" || r.status === "ENTREGUE";
    const entryPending = !r.entry.completed;
    const deliveryPending = deliveryRelevant && !r.delivery.completed;
    return { r, deliveryRelevant, entryPending, deliveryPending, pending: entryPending || deliveryPending };
  });
  const visible = showAll ? items : items.filter((i) => i.pending);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold tracking-tight">Checklists</h1>
      <p className="text-sm text-muted">
        OS dos últimos 60 dias com checklist pendente. Toque em <strong>Entrada</strong> ou <strong>Entrega</strong>{" "}
        para marcar os itens.
      </p>

      <div className="flex gap-2">
        <Link
          href="/dashboard/checklists"
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            !showAll ? "bg-accent text-accent-foreground" : "bg-surface text-muted"
          }`}
        >
          Pendentes ({items.filter((i) => i.pending).length})
        </Link>
        <Link
          href="/dashboard/checklists?todas=1"
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            showAll ? "bg-accent text-accent-foreground" : "bg-surface text-muted"
          }`}
        >
          Todas ({items.length})
        </Link>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
          {showAll ? "Nenhuma OS nos últimos 60 dias." : "Tudo em dia: nenhum checklist pendente."}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map(({ r, deliveryRelevant }) => (
            <li key={r.workOrderId} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link href={`/dashboard/os/${r.workOrderId}`} className="font-mono text-sm font-bold">
                    {r.number}
                  </Link>
                  <p className="text-sm">{r.customer ?? "—"}</p>
                  <p className="text-xs text-muted">
                    {[r.plate ? formatPlate(r.plate) : null, r.vehicle].filter(Boolean).join(" · ") || "Veículo sem identificação"}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-[11px] font-semibold text-muted">
                  {WORK_ORDER_STATUS_LABEL[r.status as WorkOrderStatus] ?? r.status}
                </span>
              </div>
              <div className="flex gap-2">
                <Chip
                  label="Entrada"
                  href={`/dashboard/os/${r.workOrderId}/checklist-entrada`}
                  progress={r.entry}
                  relevant
                />
                <Chip
                  label="Entrega"
                  href={`/dashboard/os/${r.workOrderId}/checklist-entrega`}
                  progress={r.delivery}
                  relevant={deliveryRelevant}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
