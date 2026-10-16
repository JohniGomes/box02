import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkOrderService } from "@/lib/workOrders/service";
import { getWorkOrderChecklistsService } from "@/lib/workOrders/checklistService";
import { findUserById } from "@/lib/db/repositories/users";
import { formatPlate } from "@/lib/validation/plate";
import { PdfStyleHeader } from "@/components/PdfStyleHeader";
import { PrintButton } from "@/components/PrintButton";
import { ChecklistItemsTable } from "../ChecklistItemsTable";
import { StartChecklistButton } from "../StartChecklistButton";
import { CompleteChecklistButton } from "../CompleteChecklistButton";

export default async function ChecklistEntregaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getWorkOrderService(id);
  if (!data) notFound();
  const { workOrder, items } = data;

  const checklists = await getWorkOrderChecklistsService(workOrder.id);
  const entrega = checklists.find((c) => c.checklist.type === "ENTREGA");

  const executorIds = Array.from(
    new Set(items.map((i) => i.executedByUserId).filter((v): v is string => Boolean(v))),
  );
  const executors = await Promise.all(executorIds.map((uid) => findUserById(uid)));
  const executorNames = executors.filter(Boolean).map((u) => u!.name);

  const pendingRequired = entrega ? entrega.items.filter((i) => i.required && !i.checked).length : 0;
  const locked = Boolean(entrega?.checklist.completedAt);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 print:gap-2">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href={`/dashboard/os/${workOrder.id}`} className="text-sm text-muted hover:underline">
          ← Voltar para a OS
        </Link>
        <PrintButton label="Imprimir checklist" />
      </div>

      <PdfStyleHeader title="Conferência de Entrega" subtitle="CHK-006 · Todos os itens são obrigatórios" />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border text-sm">
        <Field label="Nº da OS / PROV" value={workOrder.number} />
        <Field
          label="Data / hora"
          value={workOrder.deliveredAt ? new Date(workOrder.deliveredAt).toLocaleString("pt-BR") : "—"}
        />
        <Field label="Placa" value={workOrder.vehiclePlateSnapshot ? formatPlate(workOrder.vehiclePlateSnapshot) : "—"} />
        <Field label="Recebido por" value={workOrder.deliveryAcceptedName ?? "—"} />
      </div>

      <p className="text-xs text-muted">
        Faça junto com o cliente, na entrega. <strong>O atendimento não é fechado com item pendente.</strong>
      </p>

      {!entrega ? (
        <StartChecklistButton workOrderId={workOrder.id} type="ENTREGA" />
      ) : (
        <>
          <ChecklistItemsTable
            workOrderId={workOrder.id}
            workOrderChecklistId={entrega.checklist.id}
            items={entrega.items}
            variant="simple"
            locked={locked}
          />

          {!locked ? (
            <div className="flex justify-end print:hidden">
              <CompleteChecklistButton
                workOrderId={workOrder.id}
                workOrderChecklistId={entrega.checklist.id}
                pendingCount={pendingRequired}
              />
            </div>
          ) : null}
        </>
      )}

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border text-sm">
        <Field label="Executor(es)" value={executorNames.length > 0 ? executorNames.join(", ") : "—"} />
        <Field
          label="Entrega: data/hora"
          value={workOrder.deliveredAt ? new Date(workOrder.deliveredAt).toLocaleString("pt-BR") : "—"}
        />
        <Field label="Recebido por" value={workOrder.deliveryAcceptedName ?? "—"} />
        <Field label="Responsável BOX 02" value={executorNames[0] ?? "—"} />
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface p-3">
      <p className="text-[10px] font-semibold uppercase text-muted">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}
