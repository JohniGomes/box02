import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkOrderService, listWorkOrderReturnsService } from "@/lib/workOrders/service";
import { getWorkOrderChecklistsService } from "@/lib/workOrders/checklistService";
import { getCustomerService } from "@/lib/customers/service";
import { getVehicleService } from "@/lib/vehicles/service";
import { formatPlate } from "@/lib/validation/plate";
import { WORK_ORDER_STATUS_CLASS, WORK_ORDER_STATUS_LABEL } from "../statusLabels";
import { WorkOrderReceptionSection } from "./WorkOrderReceptionSection";
import { OpenReturnButton } from "./OpenReturnButton";
import type { WorkOrderChecklistView } from "./WorkOrderChecklistPanel";
import { formatDateTimeBR } from "@/lib/dateBr";

/**
 * Tela principal da OS — enxuta por pedido explícito: cliente/veículo
 * e os dois documentos oficiais (Checklist, Termo de Recepção). O
 * resto (itens, diagnóstico, pagamentos, status, adicionais) não foi
 * removido do sistema — mora em "Detalhes operacionais", um clique
 * daqui, pra quem precisar.
 */
export default async function WorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getWorkOrderService(id);
  if (!data) notFound();
  const { workOrder } = data;

  const [customer, vehicle, workOrderChecklists, returns, original] = await Promise.all([
    getCustomerService(workOrder.customerId),
    getVehicleService(workOrder.vehicleId),
    getWorkOrderChecklistsService(workOrder.id),
    listWorkOrderReturnsService(workOrder.id),
    workOrder.returnOfWorkOrderId ? getWorkOrderService(workOrder.returnOfWorkOrderId) : Promise.resolve(null),
  ]);

  function toChecklistView(
    entry: (typeof workOrderChecklists)[number] | undefined,
  ): WorkOrderChecklistView | null {
    if (!entry) return null;
    return {
      id: entry.checklist.id,
      code: entry.checklist.code,
      name: entry.checklist.name,
      startedAt: entry.checklist.startedAt.toISOString(),
      completedAt: entry.checklist.completedAt ? entry.checklist.completedAt.toISOString() : null,
      items: entry.items.map((i) => ({
        id: i.id,
        description: i.description,
        required: i.required,
        checked: i.checked,
        status: i.status,
        observacao: i.observacao,
      })),
    };
  }

  const entradaChecklist = toChecklistView(workOrderChecklists.find((c) => c.checklist.type === "ENTRADA"));
  const entregaChecklist = toChecklistView(workOrderChecklists.find((c) => c.checklist.type === "ENTREGA"));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <Link href="/dashboard/os" className="text-sm text-muted hover:underline">
          ← Ordens de Serviço
        </Link>
        <Link
          href={`/dashboard/os/${workOrder.id}/imprimir`}
          className="flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium hover:border-accent"
        >
          Imprimir / Gerar PDF
        </Link>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <h1 className="font-mono text-xl font-bold">{workOrder.number}</h1>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${WORK_ORDER_STATUS_CLASS[workOrder.status]}`}
          >
            {WORK_ORDER_STATUS_LABEL[workOrder.status]}
          </span>
        </div>
        <p className="text-sm text-muted">
          Entrada em {formatDateTimeBR(workOrder.entryAt)}{workOrder.mileageAtEntry != null ? ` · ${workOrder.mileageAtEntry.toLocaleString("pt-BR")} km` : ""}
        </p>
      </div>

      {original ? (
        <p className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
          Retorno da{" "}
          <Link href={`/dashboard/os/${original.workOrder.id}`} className="font-mono font-semibold text-accent">
            {original.workOrder.number}
          </Link>
          .
        </p>
      ) : null}
      {returns.length > 0 ? (
        <p className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
          {returns.length === 1 ? "Retorno:" : "Retornos:"}{" "}
          {returns.map((r, idx) => (
            <span key={r.id}>
              {idx > 0 ? ", " : ""}
              <Link href={`/dashboard/os/${r.id}`} className="font-mono font-semibold text-accent">
                {r.number}
              </Link>{" "}
              <span className="text-muted">({WORK_ORDER_STATUS_LABEL[r.status]})</span>
            </span>
          ))}
        </p>
      ) : null}
      {workOrder.status === "ENTREGUE" ? <OpenReturnButton workOrderId={workOrder.id} /> : null}

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">Cliente e veículo</h2>
        <p className="text-sm">{workOrder.customerNameSnapshot}</p>
        <p className="text-sm text-muted">
          {workOrder.vehiclePlateSnapshot ? formatPlate(workOrder.vehiclePlateSnapshot) : "Sem placa"}
          {workOrder.vehicleDescriptionSnapshot ? ` — ${workOrder.vehicleDescriptionSnapshot}` : ""}
        </p>
        <div className="mt-3 flex gap-3 text-xs">
          {customer ? (
            <Link href={`/dashboard/clientes/${customer.id}`} className="text-accent">
              Ver cliente →
            </Link>
          ) : null}
          {vehicle ? (
            <Link href={`/dashboard/veiculos/${vehicle.id}`} className="text-accent">
              Ver veículo →
            </Link>
          ) : null}
        </div>
      </section>

      <WorkOrderReceptionSection
        workOrderId={workOrder.id}
        receptionAcceptedAt={workOrder.receptionAcceptedAt ? workOrder.receptionAcceptedAt.toISOString() : null}
        receptionAcceptedName={workOrder.receptionAcceptedName}
      />

      <div className="flex flex-col gap-3">
        <DocumentCard
          href={`/dashboard/os/${workOrder.id}/checklist-entrada`}
          title="Checklist de entrada"
          subtitle="CHK-001 — inspeção na recepção do veículo"
          checklist={entradaChecklist}
        />
        <DocumentCard
          href={`/dashboard/os/${workOrder.id}/checklist-entrega`}
          title="Checklist de entrega"
          subtitle="CHK-006 — conferência antes de entregar o veículo"
          checklist={entregaChecklist}
        />
      </div>

      <Link
        href={`/dashboard/os/${workOrder.id}/detalhes`}
        className="rounded-xl border border-dashed border-border p-4 text-center text-sm font-medium text-muted hover:border-accent hover:text-accent"
      >
        Ver detalhes operacionais (itens, diagnóstico, pagamentos, status…) →
      </Link>
    </div>
  );
}

function DocumentCard({
  href,
  title,
  subtitle,
  checklist,
}: {
  href: string;
  title: string;
  subtitle: string;
  checklist: WorkOrderChecklistView | null;
}) {
  const pending = checklist ? checklist.items.filter((i) => i.required && !i.checked).length : 0;

  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-2xl border border-border bg-surface p-5 hover:border-accent"
    >
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>
      {!checklist ? (
        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">Abrir</span>
      ) : checklist.completedAt ? (
        <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
          Finalizado
        </span>
      ) : pending > 0 ? (
        <span className="rounded-full bg-muted/20 px-2 py-0.5 text-[11px] font-semibold text-muted">
          {pending} pendente(s)
        </span>
      ) : (
        <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
          Tudo marcado
        </span>
      )}
    </Link>
  );
}
