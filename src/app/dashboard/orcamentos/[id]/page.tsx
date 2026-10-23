import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getActiveQuoteLinkService,
  getQuoteApprovalService,
  getQuoteService,
  getRestorableVersion,
  listQuoteWorkOrdersService,
} from "@/lib/quotes/service";
import { WORK_ORDER_STATUS_LABEL } from "../../os/statusLabels";
import type { WorkOrderStatus } from "@/lib/db/repositories/workOrders";
import { getCustomerService } from "@/lib/customers/service";
import { getVehicleService } from "@/lib/vehicles/service";
import { computeQuoteTotals, formatBRL } from "@/lib/money";
import { auth } from "@/auth";
import { listExecutorOptionsService } from "@/lib/executors/service";
import { RegisterCompletedServiceForm } from "./RegisterCompletedServiceForm";
import { formatPlate } from "@/lib/validation/plate";
import { QUOTE_STATUS_CLASS, QUOTE_STATUS_LABEL } from "../statusLabels";
import {
  CancelQuoteButton,
  DeleteQuoteButton,
  DiscardVersionButton,
  NewVersionButton,
  RestoreVersionButton,
  SendQuoteButton,
} from "./QuoteActions";
import { ConvertQuoteToWorkOrderForm } from "./ConvertQuoteToWorkOrderForm";
import { QuoteCheckInEditor } from "./QuoteCheckInEditor";
import { RegisterApprovalForm } from "./RegisterApprovalForm";
import { CopyLinkButton } from "./CopyLinkButton";
import { PrintButton } from "@/components/PrintButton";

const ITEM_TYPE_LABEL: Record<string, string> = {
  SERVICO: "Serviço",
  PECA: "Peça",
  MAO_DE_OBRA: "Mão de obra",
};

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getQuoteService(id);
  if (!data) notFound();

  const { quote, version, items, allVersions } = data;
  const [customer, vehicle, activeLink, approval, workOrders] = await Promise.all([
    getCustomerService(quote.customerId),
    getVehicleService(quote.vehicleId),
    getActiveQuoteLinkService(version.id),
    getQuoteApprovalService(version.id),
    listQuoteWorkOrdersService(quote.id),
  ]);

  // Versão anterior que ainda vale (para "voltar" ao descartar/restaurar).
  const restorable = getRestorableVersion(allVersions, version.versionNumber);

  const isDraft = version.status === "RASCUNHO";
  const isSent = version.status === "ENVIADO";
  const canCreateNewVersion = !isDraft;
  const canCancel = isDraft || isSent;
  const isApprovedForConversion = version.status === "APROVADO" || version.status === "APROVADO_PARCIAL";
  const canRegisterApproval =
    (isDraft || isSent || version.status === "EXPIRADO") &&
    items.some((i) => i.category !== "INFORMATIVO");
  const hasActiveWorkOrder = workOrders.some((w) => w.status !== "CANCELADA");
  const canRegisterCompleted = !hasActiveWorkOrder && (canRegisterApproval || isApprovedForConversion);

  // Total que o serviço fechará: tudo (não informativo) se ainda vai ser
  // aprovado por inteiro; só os itens já aprovados se a decisão já existe.
  const completedTotals = computeQuoteTotals({
    items: items
      .filter((i) => i.category !== "INFORMATIVO" && (isApprovedForConversion ? i.clientDecision === "APROVADO" : true))
      .map((i) => ({ type: i.type, totalCents: i.totalCents })),
    discountType: version.discountType,
    discountValue: version.discountValue,
    surchargeType: version.surchargeType,
    surchargeValue: version.surchargeValue,
  });
  const [executors, session] = canRegisterCompleted
    ? await Promise.all([listExecutorOptionsService(), auth()])
    : [[], null];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href="/dashboard/orcamentos" className="text-sm text-muted hover:underline">
          ← Orçamentos
        </Link>
        <div className="flex items-center gap-2">
          <PrintButton label="Imprimir orçamento" />
          {isDraft ? (
            <Link
              href={`/dashboard/orcamentos/${quote.id}/editar`}
              className="flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium"
            >
              Editar
            </Link>
          ) : null}
        </div>
      </div>

      <div className="hidden text-center print:block">
        <p className="text-sm font-semibold">BOX 02 — Centro Automotivo</p>
        <p className="text-xs text-muted">Anápolis/GO</p>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <h1 className="font-mono text-xl font-bold">{quote.number}</h1>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${QUOTE_STATUS_CLASS[version.status]}`}
          >
            {QUOTE_STATUS_LABEL[version.status]}
          </span>
          <span className="text-xs text-muted">versão {version.versionNumber}</span>
        </div>
        <p className="text-sm text-muted">
          Válido até {new Date(version.validUntil).toLocaleDateString("pt-BR")}
          {version.sentAt ? ` · enviado em ${new Date(version.sentAt).toLocaleDateString("pt-BR")}` : ""}
        </p>
      </div>

      {workOrders.length > 0 ? (
        <section className="rounded-2xl border border-border bg-surface p-5 print:hidden">
          <h2 className="mb-3 text-sm font-semibold">{workOrders.length === 1 ? "OS gerada" : "OS geradas"}</h2>
          <ul className="flex flex-col gap-2">
            {workOrders.map((w) => (
              <li key={w.id}>
                <Link
                  href={`/dashboard/os/${w.id}`}
                  className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-sm hover:border-accent"
                >
                  <span>
                    <span className="font-mono font-medium">{w.number}</span>{" "}
                    <span className="text-xs text-muted">
                      · da versão {w.versionNumber} · {WORK_ORDER_STATUS_LABEL[w.status as WorkOrderStatus] ?? w.status}
                    </span>
                  </span>
                  <span className="text-xs text-accent">Abrir OS →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">Cliente e veículo</h2>
        <div className="flex flex-col gap-2 text-sm">
          {customer ? (
            <Link
              href={`/dashboard/clientes/${customer.id}`}
              className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3 hover:border-accent"
            >
              <span className="font-medium">{customer.legalName}</span>
              <span className="text-xs text-accent">Ver cliente →</span>
            </Link>
          ) : null}
          {vehicle ? (
            <Link
              href={`/dashboard/veiculos/${vehicle.id}`}
              className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3 hover:border-accent"
            >
              <span className="font-mono font-medium">
                {vehicle.plate ? formatPlate(vehicle.plate) : "Sem placa"}
              </span>
              <span className="text-xs text-accent">Ver veículo →</span>
            </Link>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">Itens</h2>
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl border border-border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted">{ITEM_TYPE_LABEL[item.type]}</span>
                <span className="text-sm font-semibold">{formatBRL(item.totalCents)}</span>
              </div>
              <p className="text-sm">{item.description}{item.customerSupplied ? <span className="ml-1 text-xs text-muted">(peça do cliente — sem cobrança)</span> : null}</p>
              {item.notes ? <p className="whitespace-pre-line text-xs text-muted">{item.notes}</p> : null}
              <p className="text-xs text-muted">
                {Number(item.quantity)} × {formatBRL(item.unitPriceCents)}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded-xl bg-background p-4 text-sm">
          <Row label="Serviços" value={formatBRL(version.subtotalServicesCents)} />
          <Row label="Peças" value={formatBRL(version.subtotalPartsCents)} />
          <Row label="Mão de obra" value={formatBRL(version.subtotalLaborCents)} />
          {version.discountTotalCents > 0 ? (
            <Row label="Desconto" value={`- ${formatBRL(version.discountTotalCents)}`} />
          ) : null}
          {version.discountTotalCents > 0 && version.discountReason ? (
            <p className="py-1 text-xs text-muted print:hidden">Motivo do desconto (interno): {version.discountReason}</p>
          ) : null}
          {version.surchargeTotalCents > 0 ? (
            <Row label="Acréscimo" value={`+ ${formatBRL(version.surchargeTotalCents)}`} />
          ) : null}
          <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
            <span>Total</span>
            <span>{formatBRL(version.totalCents)}</span>
          </div>
        </div>
      </section>

      {version.customerMessage ? (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-2 text-sm font-semibold">Mensagem para o cliente</h2>
          <p className="whitespace-pre-wrap text-sm">{version.customerMessage}</p>
        </section>
      ) : null}

      {!hasActiveWorkOrder && version.status !== "CANCELADO" ? (
        <QuoteCheckInEditor
          quoteId={quote.id}
          initialComplaint={quote.customerComplaint}
          initialMileage={quote.mileageAtEntry}
          lastMileage={vehicle?.mileage ?? null}
        />
      ) : null}

      {version.internalNotes ? (
        <section className="rounded-2xl border border-border bg-surface p-5 print:hidden">
          <h2 className="mb-2 text-sm font-semibold">Observação interna</h2>
          <p className="whitespace-pre-wrap text-sm">{version.internalNotes}</p>
        </section>
      ) : null}

      <section className={`rounded-2xl border border-border p-5 ${approval ? "" : "print:hidden"}`}>
        <h2 className="mb-1 text-sm font-semibold">Aprovação do cliente</h2>
        {approval ? (
          <div className="mt-2 flex flex-col gap-1 text-sm">
            <p>
              Decidido por <span className="font-medium">{approval.approverName}</span> em{" "}
              {new Date(approval.decidedAt).toLocaleString("pt-BR")}
              {approval.channel === "PRESENCIAL" ? " (registrado pela oficina)" : ""}
            </p>
            <p className="text-muted">
              Resultado:{" "}
              <span className="font-medium text-foreground">{QUOTE_STATUS_LABEL[approval.decision]}</span>
            </p>
            {approval.reason ? <p className="text-muted">Motivo: {approval.reason}</p> : null}
            {approval.notes ? <p className="text-muted">Obs.: {approval.notes}</p> : null}
          </div>
        ) : activeLink ? (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-sm text-muted">
              Link ativo — repasse ao cliente (WhatsApp, ligação, presencialmente). Válido até{" "}
              {new Date(activeLink.expiresAt).toLocaleDateString("pt-BR")}.
            </p>
            <CopyLinkButton token={activeLink.token} />
          </div>
        ) : (
          <p className="text-sm text-muted">
            {isDraft
              ? "Envie o orçamento para gerar o link de aprovação."
              : "Nenhum link ativo para esta versão."}
          </p>
        )}
      </section>

      {allVersions.length > 1 ? (
        <section className="rounded-2xl border border-border bg-surface p-5 print:hidden">
          <h2 className="mb-3 text-sm font-semibold">Histórico de versões</h2>
          <ul className="flex flex-col gap-2">
            {allVersions.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-sm"
              >
                <span>Versão {v.versionNumber}</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted">{formatBRL(v.totalCents)}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${QUOTE_STATUS_CLASS[v.status]}`}
                  >
                    {QUOTE_STATUS_LABEL[v.status]}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-col gap-3 print:hidden">
        {isDraft ? <SendQuoteButton quoteId={quote.id} /> : null}
        {canRegisterApproval ? (
          <RegisterApprovalForm
            quoteId={quote.id}
            customerName={customer?.legalName ?? ""}
            items={items
              .filter((i) => i.category !== "INFORMATIVO")
              .map((i) => ({
                id: i.id,
                description: i.description,
                typeLabel: ITEM_TYPE_LABEL[i.type],
                totalCents: i.totalCents,
              }))}
          />
        ) : null}
        {isApprovedForConversion && !hasActiveWorkOrder ? <ConvertQuoteToWorkOrderForm
            quoteId={quote.id}
            lastMileage={vehicle?.mileage ?? null}
            defaultComplaint={quote.customerComplaint ?? ""}
            defaultMileage={quote.mileageAtEntry !== null ? String(quote.mileageAtEntry) : ""}
          /> : null}
        {canRegisterCompleted && completedTotals.totalCents > 0 ? (
          <RegisterCompletedServiceForm
            quoteId={quote.id}
            totalCents={completedTotals.totalCents}
            customerName={customer?.legalName ?? ""}
            lastMileage={vehicle?.mileage ?? null}
            defaultMileage={quote.mileageAtEntry !== null ? String(quote.mileageAtEntry) : ""}
            executors={executors}
            currentUserId={session?.user?.id ?? ""}
          />
        ) : null}
        {version.status === "CANCELADO" && restorable ? (
          <RestoreVersionButton
            quoteId={quote.id}
            previousVersionNumber={restorable.versionNumber}
            previousStatusLabel={QUOTE_STATUS_LABEL[restorable.status]}
          />
        ) : null}
        {canCreateNewVersion && version.status !== "CANCELADO" ? (
          <NewVersionButton
            quoteId={quote.id}
            currentVersionNumber={version.versionNumber}
            workOrderNumbers={workOrders.map((w) => w.number)}
          />
        ) : null}
        {(isDraft || isSent) && restorable ? (
          <DiscardVersionButton
            quoteId={quote.id}
            currentVersionNumber={version.versionNumber}
            previousVersionNumber={restorable.versionNumber}
            previousStatusLabel={QUOTE_STATUS_LABEL[restorable.status]}
          />
        ) : null}
        {canCancel ? <CancelQuoteButton quoteId={quote.id} /> : null}
        <DeleteQuoteButton quoteId={quote.id} />
      </div>
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
