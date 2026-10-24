import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkOrderService, listWorkOrderEvidencesService } from "@/lib/workOrders/service";
import { getWorkOrderChecklistsService } from "@/lib/workOrders/checklistService";
import { findUserById } from "@/lib/db/repositories/users";
import { formatPlate } from "@/lib/validation/plate";
import { PdfStyleHeader } from "@/components/PdfStyleHeader";
import { PrintButton } from "@/components/PrintButton";
import { ChecklistItemsTable } from "../ChecklistItemsTable";
import { StartChecklistButton } from "../StartChecklistButton";
import { CompleteChecklistButton } from "../CompleteChecklistButton";
import { DamagesEditor } from "../DamagesEditor";
import { EntryPhotoSlots } from "./EntryPhotoSlots";
import { formatDateTimeBR } from "@/lib/dateBr";

export default async function ChecklistEntradaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getWorkOrderService(id);
  if (!data) notFound();
  const { workOrder } = data;

  const locked = Boolean(workOrder.receptionAcceptedAt);

  const [checklists, evidences, receivedBy] = await Promise.all([
    getWorkOrderChecklistsService(workOrder.id),
    listWorkOrderEvidencesService(workOrder.id),
    workOrder.createdByUserId ? findUserById(workOrder.createdByUserId) : Promise.resolve(null),
  ]);
  const entrada = checklists.find((c) => c.checklist.type === "ENTRADA");

  const pendingRequired = entrada ? entrada.items.filter((i) => i.required && !i.checked).length : 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 print:gap-2">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href={`/dashboard/os/${workOrder.id}`} className="text-sm text-muted hover:underline">
          ← Voltar para a OS
        </Link>
        <PrintButton label="Imprimir checklist" />
      </div>

      <PdfStyleHeader title="Checklist de Entrada" subtitle="CHK-001 · Inspeção de recepção do veículo" />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border text-sm">
        <Field label="Nº da OS / PROV" value={workOrder.number} />
        <Field label="Data / hora" value={formatDateTimeBR(workOrder.entryAt)} />
        <Field label="Placa" value={workOrder.vehiclePlateSnapshot ? formatPlate(workOrder.vehiclePlateSnapshot) : "—"} />
        <Field label="Recebido por" value={receivedBy?.name ?? "—"} />
      </div>

      <p className="text-xs text-muted">
        Faça com o cliente ao lado. Marque <strong>OK</strong>, <strong>Atenção</strong> (algo errado — anote) ou{" "}
        <strong>N/A</strong> (não se aplica).
      </p>

      {!entrada ? (
        <StartChecklistButton workOrderId={workOrder.id} type="ENTRADA" />
      ) : (
        <>
          <ChecklistItemsTable
            workOrderId={workOrder.id}
            workOrderChecklistId={entrada.checklist.id}
            items={entrada.items}
            variant="tri"
            locked={Boolean(entrada.checklist.completedAt)}
          />

          {!entrada.checklist.completedAt ? (
            <div className="flex justify-end print:hidden">
              <CompleteChecklistButton
                workOrderId={workOrder.id}
                workOrderChecklistId={entrada.checklist.id}
                pendingCount={pendingRequired}
              />
            </div>
          ) : null}
        </>
      )}

      <EntryPhotoSlots workOrderId={workOrder.id} evidences={evidences} locked={locked} />

      <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-2 text-sm font-bold uppercase">Avarias preexistentes (local + descrição)</h2>
        <DamagesEditor
          workOrderId={workOrder.id}
          initialValue={locked ? workOrder.receptionDamagesSnapshot : workOrder.preExistingDamagesDescription}
          locked={locked}
        />
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border text-sm">
        <div className="bg-surface p-3">
          <p className="text-xs font-semibold text-muted">Cliente conferiu e concorda</p>
          <p className="mt-4 text-xs text-muted">Assinatura: ver Termo de Recepção</p>
        </div>
        <div className="bg-surface p-3">
          <p className="text-xs font-semibold text-muted">Responsável BOX 02</p>
          <p className="mt-4 text-xs text-muted">{receivedBy?.name ?? "—"}</p>
        </div>
      </div>

      <Link
        href={`/dashboard/os/${workOrder.id}/termo-recepcao`}
        className="text-center text-xs font-medium text-accent print:hidden"
      >
        Ir para o Termo de Recepção (assinatura e aceite) →
      </Link>
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
