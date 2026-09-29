import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getWorkOrderPaymentsSummaryService, getWorkOrderService, listWorkOrderEvidencesService } from "@/lib/workOrders/service";
import { getWorkOrderChecklistsService } from "@/lib/workOrders/checklistService";
import { getCustomerService } from "@/lib/customers/service";
import { getVehicleService } from "@/lib/vehicles/service";
import { getServiceService } from "@/lib/services/service";
import { listActiveUsers } from "@/lib/db/repositories/users";
import { findQuoteVersionById } from "@/lib/db/repositories/quoteVersions";
import { findQuoteById } from "@/lib/db/repositories/quotes";
import { formatBRL } from "@/lib/money";
import { formatPlate } from "@/lib/validation/plate";
import { formatDocument } from "@/lib/validation/document";
import { WORK_ORDER_STATUS_CLASS, WORK_ORDER_STATUS_LABEL, workOrderStatusToActiveMethodStage, isAtVerificamosBarrier } from "../statusLabels";
import {
  CancelWorkOrderForm,
  CloseWorkOrderForm,
  WorkOrderItemActions,
  WorkOrderItemExecutorInfo,
  WorkOrderStatusActions,
} from "./WorkOrderActions";
import { AdditionalItemsSection } from "./AdditionalItemsSection";
import { WorkOrderChecklistPanel, type WorkOrderChecklistView } from "./WorkOrderChecklistPanel";
import { WorkOrderReceptionSection } from "./WorkOrderReceptionSection";
import { WorkOrderExplanationSection } from "./WorkOrderExplanationSection";
import { WorkOrderEvidenceSection } from "./WorkOrderEvidenceSection";
import { WorkOrderTechnicalNotesSection } from "./WorkOrderTechnicalNotesSection";
import { WorkOrderPaymentsSection } from "./WorkOrderPaymentsSection";
import { MethodStepper } from "./MethodStepper";
import { MethodStageHeader } from "./MethodStageHeader";
import { CollapsibleSection } from "./CollapsibleSection";

const ITEM_TYPE_LABEL: Record<string, string> = {
  SERVICO: "Serviço",
  PECA: "Peça",
  MAO_DE_OBRA: "Mão de obra",
};

const ITEM_STATUS_LABEL: Record<string, string> = {
  PLANEJADO: "Planejado",
  EXECUTADO: "Executado",
  CANCELADO: "Cancelado",
};

export default async function WorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const currentUserId = session.user.id;

  const data = await getWorkOrderService(id);
  if (!data) notFound();

  const { workOrder, items } = data;
  const paymentsSummary =
    workOrder.status === "ENTREGUE" ? await getWorkOrderPaymentsSummaryService(workOrder.id) : null;
  const evidences = await listWorkOrderEvidencesService(workOrder.id);
  const [customer, vehicle, workOrderChecklists, activeUsers] = await Promise.all([
    getCustomerService(workOrder.customerId),
    getVehicleService(workOrder.vehicleId),
    getWorkOrderChecklistsService(workOrder.id),
    listActiveUsers(),
  ]);

  const isOpenForCancel = workOrder.status !== "ENTREGUE" && workOrder.status !== "CANCELADA";
  const canClose = workOrder.status === "PRONTA";
  const canManageAdditionals = isOpenForCancel;
  const baseItems = items.filter((i) => i.origin !== "ADICIONAL_DURANTE_EXECUCAO");
  const additionalItems = items.filter((i) => i.origin === "ADICIONAL_DURANTE_EXECUCAO");

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
      items: entry.items.map((i) => ({ id: i.id, description: i.description, required: i.required, checked: i.checked })),
    };
  }

  const entradaChecklist = toChecklistView(workOrderChecklists.find((c) => c.checklist.type === "ENTRADA"));
  const entregaChecklist = toChecklistView(workOrderChecklists.find((c) => c.checklist.type === "ENTREGA"));

  const executionChecklistByItemId = new Map<string, WorkOrderChecklistView | null>();
  const itemsNeedingServiceCheck = baseItems.filter((i) => i.serviceId);
  for (const item of itemsNeedingServiceCheck) {
    const service = item.serviceId ? await getServiceService(item.serviceId) : null;
    if (service?.executionChecklistId) {
      const existing = workOrderChecklists.find(
        (c) => c.checklist.type === "EXECUCAO" && c.checklist.workOrderItemId === item.id,
      );
      executionChecklistByItemId.set(item.id, toChecklistView(existing));
    }
  }

  let sourceQuote: { id: string; number: string } | null = null;
  let quoteCustomerMessage: string | null = null;
  if (workOrder.sourceQuoteVersionId) {
    const version = await findQuoteVersionById(workOrder.sourceQuoteVersionId);
    if (version) {
      quoteCustomerMessage = version.customerMessage;
      const quote = await findQuoteById(version.quoteId);
      if (quote) sourceQuote = { id: quote.id, number: quote.number };
    }
  }

  const photosItem = entradaChecklist?.items.find((i) => i.description === "Fotos de entrada realizadas") ?? null;

  const activeStage = workOrderStatusToActiveMethodStage(workOrder.status);
  const showVerificando = isAtVerificamosBarrier(workOrder.status);

  const deliveryChecklistPendingCount = entregaChecklist
    ? entregaChecklist.items.filter((i) => i.required && !i.checked).length
    : 0;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/os" className="text-sm text-muted hover:underline">
        ← Ordens de Serviço
      </Link>

      {workOrder.status !== "CANCELADA" ? (
        <MethodStepper activeStage={activeStage} showVerificandoBarrier={showVerificando} />
      ) : (
        <div className="rounded-xl border border-border bg-muted/10 p-3 text-center text-xs font-semibold text-muted">
          OS cancelada — fora da sequência do Método
        </div>
      )}

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
          Entrada em {new Date(workOrder.entryAt).toLocaleString("pt-BR")} · {workOrder.mileageAtEntry.toLocaleString("pt-BR")} km
        </p>
      </div>

      <MethodStageHeader stage="IDENTIFICAMOS" />

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">Cliente e veículo</h2>
        <p className="text-sm">{workOrder.customerNameSnapshot}</p>
        <p className="text-sm text-muted">
          {workOrder.vehiclePlateSnapshot ? formatPlate(workOrder.vehiclePlateSnapshot) : "Sem placa"}
          {workOrder.vehicleDescriptionSnapshot ? ` — ${workOrder.vehicleDescriptionSnapshot}` : ""}
        </p>
        <p className="mt-1 text-xs text-muted">
          (dados congelados no check-in — não mudam mesmo que o cadastro seja editado depois)
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
        preExistingDamagesDescription={workOrder.preExistingDamagesDescription}
        receptionAcceptedAt={workOrder.receptionAcceptedAt ? workOrder.receptionAcceptedAt.toISOString() : null}
        receptionAcceptedName={workOrder.receptionAcceptedName}
        canManage={isOpenForCancel}
      />

      <WorkOrderChecklistPanel
        workOrderId={workOrder.id}
        type="ENTRADA"
        initial={entradaChecklist}
        canManage={isOpenForCancel}
      />

      {workOrder.customerComplaint ? (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-1 text-sm font-semibold">Queixa do cliente</h2>
          <p className="text-sm">{workOrder.customerComplaint}</p>
        </section>
      ) : null}

      <MethodStageHeader stage="DIAGNOSTICAMOS" />

      {workOrder.diagnosis ? (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-1 text-sm font-semibold">Diagnóstico</h2>
          <p className="text-sm">{workOrder.diagnosis}</p>
        </section>
      ) : (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-sm text-muted">Nenhum diagnóstico registrado ainda.</p>
        </section>
      )}

      <MethodStageHeader stage="REGISTRAMOS" />

      <section className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-sm">
          {photosItem ? (
            <>
              {photosItem.checked ? "☑" : "☐"} Fotos de entrada realizadas
              <span className="ml-1 text-xs text-muted">(item do checklist de entrada)</span>
            </>
          ) : (
            <span className="text-muted">Checklist de entrada não foi utilizado — nenhum registro de fotos disponível.</span>
          )}
        </p>
        <Link href={`/dashboard/os/${workOrder.id}/termo-recepcao`} className="mt-2 inline-block text-xs font-medium text-accent">
          Ver Termo de Recepção (registro formal da recepção) →
        </Link>
      </section>

      <WorkOrderEvidenceSection
        workOrderId={workOrder.id}
        locked={workOrder.receptionAcceptedAt !== null}
        evidences={evidences.map((ev) => ({
          id: ev.id,
          type: ev.type,
          description: ev.description,
          createdAt: ev.createdAt.toISOString(),
        }))}
      />

      <MethodStageHeader stage="EXPLICAMOS" />

      <WorkOrderExplanationSection
        workOrderId={workOrder.id}
        diagnosisExplanationNotes={workOrder.diagnosisExplanationNotes}
        quoteCustomerMessage={quoteCustomerMessage}
        canManage={isOpenForCancel}
      />

      <MethodStageHeader stage="ORCAMOS" />

      <section className="rounded-2xl border border-border bg-surface p-5">
        {sourceQuote ? (
          <Link href={`/dashboard/orcamentos/${sourceQuote.id}`} className="text-sm font-medium text-accent">
            Ver orçamento de origem — {sourceQuote.number} →
          </Link>
        ) : (
          <p className="text-sm text-muted">Não aplicável. OS criada diretamente, sem orçamento de origem.</p>
        )}
      </section>

      <MethodStageHeader stage="EXECUTAMOS" />

      <CollapsibleSection title="Itens do orçamento/OS" defaultOpen={baseItems.length <= 3}>
        {baseItems.length === 0 ? (
          <p className="text-sm text-muted">Nenhum item ainda.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {baseItems.map((item) => (
              <li key={item.id} className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted">{ITEM_TYPE_LABEL[item.type]}</span>
                  <span className="text-sm font-semibold">{formatBRL(item.totalCents)}</span>
                </div>
                <p className="text-sm">{item.description}</p>
                <div className="mt-1 flex items-center justify-between">
                  <p className="text-xs text-muted">
                    {Number(item.quantity)} × {formatBRL(item.unitPriceCents)} ·{" "}
                    <span className="font-medium">{ITEM_STATUS_LABEL[item.status]}</span>
                  </p>
                </div>
                {item.status === "PLANEJADO" && isOpenForCancel ? (
                  <div className="mt-2">
                    <WorkOrderItemActions
                      workOrderId={workOrder.id}
                      itemId={item.id}
                      users={activeUsers}
                      currentUserId={currentUserId}
                    />
                  </div>
                ) : null}
                {item.status === "EXECUTADO" ? (
                  <WorkOrderItemExecutorInfo
                    workOrderId={workOrder.id}
                    itemId={item.id}
                    executedByUserId={item.executedByUserId}
                    users={activeUsers}
                    canManage={isOpenForCancel}
                  />
                ) : null}
                {item.cancelReason ? (
                  <p className="mt-1 text-xs text-danger">Motivo: {item.cancelReason}</p>
                ) : null}
                {executionChecklistByItemId.has(item.id) ? (
                  <div className="mt-2">
                    <WorkOrderChecklistPanel
                      workOrderId={workOrder.id}
                      type="EXECUCAO"
                      workOrderItemId={item.id}
                      initial={executionChecklistByItemId.get(item.id) ?? null}
                      canManage={isOpenForCancel && item.status === "PLANEJADO"}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Adicionais" defaultOpen={additionalItems.length <= 2}>
        <AdditionalItemsSection
          workOrderId={workOrder.id}
          canManage={canManageAdditionals}
          users={activeUsers}
          currentUserId={currentUserId}
          items={additionalItems.map((item) => ({
            id: item.id,
            type: item.type,
            description: item.description,
            totalCents: item.totalCents,
            status: item.status,
            clientDecision: item.clientDecision,
            clientAuthorizedBy: item.clientAuthorizedBy,
            authorizationChannel: item.authorizationChannel,
            cancelReason: item.cancelReason,
            customerPhone: customer?.whatsapp ?? customer?.phone ?? null,
            executedByUserId: item.executedByUserId,
          }))}
        />
      </CollapsibleSection>

      {showVerificando ? (
        <p className="rounded-xl bg-accent/10 px-3 py-2 text-center text-xs font-semibold text-accent">
          Verificando — barreira interna antes da entrega, não é uma etapa separada do Método
        </p>
      ) : null}

      <WorkOrderChecklistPanel
        workOrderId={workOrder.id}
        type="ENTREGA"
        initial={entregaChecklist}
        canManage={isOpenForCancel}
      />

      <MethodStageHeader stage="ENTREGAMOS" />

      <WorkOrderTechnicalNotesSection
        workOrderId={workOrder.id}
        technicalNotes={workOrder.technicalNotes}
        applicable={workOrder.status === "PRONTA" || workOrder.status === "ENTREGUE"}
      />

      {workOrder.status === "ENTREGUE" ? (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold">Fechamento</h2>
          <div className="flex justify-between text-base font-semibold">
            <span>Total</span>
            <span>{formatBRL(workOrder.totalCents)}</span>
          </div>
          <p className="mt-2 text-xs text-muted">
            Entregue em {workOrder.deliveredAt ? new Date(workOrder.deliveredAt).toLocaleString("pt-BR") : "—"}
          </p>
          {workOrder.deliveryAcceptedName ? (
            <p className="text-xs text-muted">
              Recebido por {workOrder.deliveryAcceptedName}
              {workOrder.deliveryAcceptedDocument ? ` (${formatDocument(workOrder.deliveryAcceptedDocument)})` : ""}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-muted">
            Valor devido calculado a partir dos itens executados — ver seção &quot;Recebimentos&quot; abaixo para o
            status de pagamento.
          </p>
        </section>
      ) : null}

      {paymentsSummary ? (
        <WorkOrderPaymentsSection
          workOrderId={workOrder.id}
          summary={{
            dueCents: paymentsSummary.dueCents,
            paidCents: paymentsSummary.paidCents,
            remainingCents: paymentsSummary.remainingCents,
            status: paymentsSummary.status,
            payments: paymentsSummary.payments.map((p) => ({
              id: p.id,
              amountCents: p.amountCents,
              method: p.method,
              notes: p.notes,
              receivedAt: p.receivedAt.toISOString(),
            })),
            refunds: paymentsSummary.refunds.map((r) => ({
              id: r.id,
              paymentId: r.paymentId,
              refundCents: r.refundCents,
              reason: r.reason,
              createdAt: r.createdAt.toISOString(),
            })),
          }}
        />
      ) : null}

      {workOrder.status === "CANCELADA" && workOrder.cancelReason ? (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-1 text-sm font-semibold">Cancelamento</h2>
          <p className="text-sm text-muted">{workOrder.cancelReason}</p>
        </section>
      ) : null}

      <div className="flex flex-col gap-3">
        <WorkOrderStatusActions
          workOrderId={workOrder.id}
          status={workOrder.status}
          receptionAccepted={workOrder.receptionAcceptedAt !== null}
        />
        {canClose ? (
          <CloseWorkOrderForm workOrderId={workOrder.id} deliveryChecklistPendingCount={deliveryChecklistPendingCount} />
        ) : null}
        {isOpenForCancel ? <CancelWorkOrderForm workOrderId={workOrder.id} /> : null}
      </div>
    </div>
  );
}
