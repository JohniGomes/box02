import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  getWorkOrderPaymentsSummaryService,
  getWorkOrderService,
  listReturnablePartsService,
  listWorkOrderCorrectionsService,
  listWorkOrderEvidencesService,
} from "@/lib/workOrders/service";
import { getWorkOrderChecklistsService } from "@/lib/workOrders/checklistService";
import { getCustomerService } from "@/lib/customers/service";
import { getVehicleService } from "@/lib/vehicles/service";
import { getServiceService } from "@/lib/services/service";
import { isDeliveryChecklistRequired, isDetailedStagesEnabled, isReceptionRequiredForExecution } from "@/lib/settings/service";
import { listExecutorOptionsService } from "@/lib/executors/service";
import { findQuoteVersionById } from "@/lib/db/repositories/quoteVersions";
import { findQuoteById } from "@/lib/db/repositories/quotes";
import { formatBRL } from "@/lib/money";
import { formatPlate } from "@/lib/validation/plate";
import { formatDocument } from "@/lib/validation/document";
import { WORK_ORDER_STATUS_CLASS, WORK_ORDER_STATUS_LABEL, workOrderStatusToActiveMethodStage, isAtVerificamosBarrier } from "../../statusLabels";
import {
  CancelWorkOrderForm,
  ReactivateWorkOrderForm,
  CloseWorkOrderForm,
  MarkAllExecutedButton,
  WorkOrderItemActions,
  WorkOrderItemExecutorInfo,
  WorkOrderStatusActions,
} from "../WorkOrderActions";
import { AdditionalItemsSection } from "../AdditionalItemsSection";
import { EditItemForm } from "../EditItemForm";
import { getQuoteSyncPreviewService } from "@/lib/workOrders/quoteSyncService";
import { SaveKitFromOrder } from "../SaveKitFromOrder";
import { getWorkOrderMarginService } from "@/lib/workOrders/marginService";
import { WorkOrderCorrections } from "../WorkOrderCorrections";
import { WorkOrderChecklistPanel, type WorkOrderChecklistView } from "../WorkOrderChecklistPanel";
import { WorkOrderExplanationSection } from "../WorkOrderExplanationSection";
import { WorkOrderEvidenceSection } from "../WorkOrderEvidenceSection";
import { WorkOrderTechnicalNotesSection } from "../WorkOrderTechnicalNotesSection";
import { WorkOrderPaymentsSection } from "../WorkOrderPaymentsSection";
import { MethodStepper } from "../MethodStepper";
import { MethodStageHeader } from "../MethodStageHeader";
import { CollapsibleSection } from "../CollapsibleSection";
import { formatDateTimeBR } from "@/lib/dateBr";

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

/**
 * Detalhes operacionais completos da OS — itens, diagnóstico,
 * explicação, orçamento de origem, adicionais, pagamentos, status.
 * Separado da tela principal da OS (que ficou enxuta: cliente/veículo
 * + os dois PDFs) por pedido explícito — nada aqui foi removido do
 * sistema, só deixou de ser o que aparece por padrão.
 */
export default async function WorkOrderDetailsPage({
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
  const corrections = await listWorkOrderCorrectionsService(workOrder.id);
  const returnableParts = await listReturnablePartsService(workOrder.id);
  const margin = await getWorkOrderMarginService(workOrder.id);
  const [customer, vehicle, workOrderChecklists, activeUsers, receptionRequired, deliveryChecklistRequired, detailedStages] = await Promise.all([
    getCustomerService(workOrder.customerId),
    getVehicleService(workOrder.vehicleId),
    getWorkOrderChecklistsService(workOrder.id),
    // Opções de "executado por": nomes da lista de executores (ou, se ela
    // estiver vazia, os usuários ativos).
    listExecutorOptionsService(),
    isReceptionRequiredForExecution(),
    isDeliveryChecklistRequired(),
    isDetailedStagesEnabled(),
  ]);

  const isOpenForCancel = workOrder.status !== "ENTREGUE" && workOrder.status !== "CANCELADA";
  // Modo simples: entrega de qualquer etapa aberta. Etapas detalhadas: só quando a OS está "Pronta".
  const canClose = workOrder.status === "PRONTA" || (!detailedStages && isOpenForCancel);
  const plannedCount = items.filter((i) => i.status === "PLANEJADO").length;
  // Existe uma versão nova do orçamento, já aprovada, que a OS ainda não acompanha?
  const quoteSync = isOpenForCancel && workOrder.sourceQuoteVersionId ? await getQuoteSyncPreviewService(workOrder.id) : null;
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

  const activeStage = workOrderStatusToActiveMethodStage(workOrder.status);
  const showVerificando = isAtVerificamosBarrier(workOrder.status);

  const deliveryChecklistPendingCount = entregaChecklist
    ? entregaChecklist.items.filter((i) => i.required && !i.checked).length
    : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/dashboard/os/${workOrder.id}`} className="text-sm text-muted hover:underline">
          ← Voltar para a OS
        </Link>
        <Link
          href={`/dashboard/os/${workOrder.id}/imprimir`}
          className="flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium hover:border-accent"
        >
          Imprimir / Gerar PDF
        </Link>
      </div>

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
          Entrada em {formatDateTimeBR(workOrder.entryAt)}{workOrder.mileageAtEntry != null ? ` · ${workOrder.mileageAtEntry.toLocaleString("pt-BR")} km` : ""}
        </p>
      </div>

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

      {quoteSync?.available ? (
        <Link
          href={`/dashboard/os/${workOrder.id}/sincronizar`}
          className="flex items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-4 text-sm print:hidden"
        >
          <span>
            <span className="block font-semibold">
              Há uma versão {quoteSync.toVersionNumber} do orçamento já aprovada, e a OS ainda segue a versão {quoteSync.fromVersionNumber}.
            </span>
            <span className="block text-xs text-muted">Compare e atualize a OS, escolhendo o que muda.</span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-accent">Atualizar →</span>
        </Link>
      ) : null}

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
                <p className="text-sm">{item.description}{item.customerSupplied ? <span className="ml-1 text-xs text-muted">(peça do cliente — sem cobrança)</span> : null}</p>
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
                    executedByName={item.executedByName}
                    users={activeUsers}
                    canManage={isOpenForCancel}
                  />
                ) : null}
                {item.cancelReason ? (
                  <p className="mt-1 text-xs text-danger">Motivo: {item.cancelReason}</p>
                ) : null}
                {workOrder.status !== "CANCELADA" && item.status !== "CANCELADO" ? (
                  <EditItemForm
                    workOrderId={workOrder.id}
                    itemId={item.id}
                    description={item.description}
                    unitPriceReais={(item.unitPriceCents / 100).toFixed(2).replace(".", ",")}
                    canEditValue={isOpenForCancel}
                  />
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
        {isOpenForCancel ? (
          <SaveKitFromOrder
            services={baseItems
              .filter((i) => i.type === "SERVICO" && i.serviceId && i.status !== "CANCELADO")
              .map((i) => ({ serviceId: i.serviceId as string, description: i.description }))}
            lines={baseItems
              .filter((i) => (i.type === "PECA" || i.type === "MAO_DE_OBRA") && i.status !== "CANCELADO" && !i.customerSupplied)
              .map((i) => ({
                id: i.id,
                type: i.type as "PECA" | "MAO_DE_OBRA",
                description: i.description,
                quantity: String(Number(i.quantity)),
                unitPriceReais: i.type === "MAO_DE_OBRA" ? (i.unitPriceCents / 100).toFixed(2).replace(".", ",") : undefined,
                partId: i.partId,
              }))}
          />
        ) : null}
      </CollapsibleSection>

      <CollapsibleSection title="Adicionais" defaultOpen={additionalItems.length <= 2}>
        <AdditionalItemsSection
          workOrderId={workOrder.id}
          customerName={customer?.legalName ?? workOrder.customerNameSnapshot}
          canManage={canManageAdditionals}
          users={activeUsers}
          currentUserId={currentUserId}
          items={additionalItems.map((item) => ({
            id: item.id,
            type: item.type,
            description: item.description,
            totalCents: item.totalCents,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            status: item.status,
            clientDecision: item.clientDecision,
            clientAuthorizedBy: item.clientAuthorizedBy,
            authorizationChannel: item.authorizationChannel,
            cancelReason: item.cancelReason,
            customerPhone: customer?.whatsapp ?? customer?.phone ?? null,
            executedByUserId: item.executedByUserId,
            executedByName: item.executedByName,
          }))}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Margem desta OS (uso interno)" defaultOpen={false}>
        {margin.revenueCents === 0 && margin.costCents === 0 ? (
          <p className="text-sm text-muted">Nada executado ainda: a margem aparece quando o primeiro item for marcado como executado.</p>
        ) : (
          <div className="flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Receita (itens executados, menos descontos)</span>
              <span className="font-medium">{formatBRL(margin.revenueCents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Custo</span>
              <span className="font-medium">{formatBRL(margin.costCents)}</span>
            </div>
            {margin.cardFeeCents > 0 ? (
              <div className="flex justify-between">
                <span className="text-muted">
                  Taxa do cartão ({String(margin.cardFeePercent).replace(".", ",")}% de {formatBRL(margin.cardPaidCents)} pagos no cartão)
                </span>
                <span className="font-medium">{formatBRL(margin.cardFeeCents)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-base font-semibold">
              <span>Lucro{margin.marginPercent === null ? "" : ` (${margin.marginPercent}%)`}</span>
              <span>{formatBRL(margin.profitCents)}</span>
            </div>
          </div>
        )}
        {margin.itemsWithoutCost > 0 ? (
          <p className="mt-3 rounded-lg bg-accent/10 px-3 py-2 text-xs">
            {margin.itemsWithoutCost} {margin.itemsWithoutCost === 1 ? "item executado está" : "itens executados estão"} sem custo informado: a margem real pode
            ser menor. É só um aviso.
          </p>
        ) : null}
        {margin.pendingItems > 0 ? (
          <p className="mt-2 text-xs text-muted">Margem parcial: ainda há {margin.pendingItems} item(ns) planejado(s) que não entraram na conta.</p>
        ) : null}
        <p className="mt-2 text-xs text-muted">Só para uso interno: não aparece no recibo nem para o cliente.</p>
      </CollapsibleSection>

      {showVerificando ? (
        <p className="rounded-xl bg-accent/10 px-3 py-2 text-center text-xs font-semibold text-accent">
          Verificando — barreira interna antes da entrega, não é uma etapa separada do Método
        </p>
      ) : null}

      <MethodStageHeader stage="ENTREGAMOS" />

      <WorkOrderTechnicalNotesSection
        workOrderId={workOrder.id}
        technicalNotes={workOrder.technicalNotes}
        applicable={workOrder.status !== "CANCELADA"}
      />

      {workOrder.status === "ENTREGUE" ? (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold">Fechamento</h2>
          <div className="flex justify-between text-base font-semibold">
            <span>Total</span>
            <span>{formatBRL(workOrder.totalCents)}</span>
          </div>
          <p className="mt-2 text-xs text-muted">
            Entregue em {workOrder.deliveredAt ? formatDateTimeBR(workOrder.deliveredAt) : "—"}
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

      <WorkOrderCorrections
        workOrderId={workOrder.id}
        delivered={workOrder.status === "ENTREGUE"}
        paidCents={paymentsSummary?.paidCents ?? 0}
        paymentCount={paymentsSummary?.payments.length ?? 0}
        history={corrections.map((c) => ({ ...c, at: c.at.toISOString() }))}
      />

      {paymentsSummary ? (
        <WorkOrderPaymentsSection
          workOrderId={workOrder.id}
          entryDate={workOrder.entryAt.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })}
          summary={{
            dueCents: paymentsSummary.dueCents,
            paidCents: paymentsSummary.paidCents,
            remainingCents: paymentsSummary.remainingCents,
            discountCents: paymentsSummary.discountCents,
            status: paymentsSummary.status,
            payments: paymentsSummary.payments.map((p) => ({
              id: p.id,
              amountCents: p.amountCents,
              method: p.method,
              notes: p.notes,
              receivedAt: p.receivedAt.toISOString(),
              cardFeeCents: p.cardFeeCents,
              installments: p.installments,
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
          receptionRequired={receptionRequired}
          detailedStages={detailedStages}
        />
        {canClose && plannedCount > 0 ? (
          <MarkAllExecutedButton
            workOrderId={workOrder.id}
            plannedCount={plannedCount}
            users={activeUsers}
            currentUserId={currentUserId}
          />
        ) : null}
        {canClose ? (
          <CloseWorkOrderForm
            workOrderId={workOrder.id}
            deliveryChecklistPendingCount={deliveryChecklistPendingCount}
            deliveryChecklistRequired={deliveryChecklistRequired}
            customerName={customer?.legalName ?? workOrder.customerNameSnapshot}
            customerDocument={
              customer?.document && customer.document.replace(/\D/g, "").length === 11 ? formatDocument(customer.document) : ""
            }
          />
        ) : null}
        {isOpenForCancel ? <CancelWorkOrderForm workOrderId={workOrder.id} returnableParts={returnableParts} /> : null}
        {workOrder.status === "CANCELADA" ? <ReactivateWorkOrderForm workOrderId={workOrder.id} /> : null}
      </div>
    </div>
  );
}
