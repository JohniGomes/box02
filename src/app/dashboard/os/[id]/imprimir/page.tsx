import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkOrderPaymentsSummaryService, getWorkOrderService } from "@/lib/workOrders/service";
import { getCustomerService } from "@/lib/customers/service";
import { getVehicleService } from "@/lib/vehicles/service";
import { formatBRL } from "@/lib/money";
import { formatPlate } from "@/lib/validation/plate";
import { formatDocument } from "@/lib/validation/document";
import { WORK_ORDER_STATUS_LABEL } from "../../statusLabels";
import { PrintButton } from "@/components/PrintButton";

const ITEM_TYPE_LABEL: Record<string, string> = {
  SERVICO: "Serviço",
  PECA: "Peça",
  MAO_DE_OBRA: "Mão de obra",
};

/**
 * Resumo da OS pronto para impressão/PDF — propositalmente separado da
 * ficha operacional (`/dashboard/os/[id]`), que tem formulários, upload
 * de evidências e painéis de checklist que não fazem sentido em papel.
 * Mesmo padrão já usado para Termo de Recepção e Entrega Técnica.
 */
export default async function PrintWorkOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getWorkOrderService(id);
  if (!data) notFound();
  const { workOrder, items } = data;

  const [customer, vehicle, paymentsSummary] = await Promise.all([
    getCustomerService(workOrder.customerId),
    getVehicleService(workOrder.vehicleId),
    workOrder.status === "ENTREGUE" ? getWorkOrderPaymentsSummaryService(workOrder.id) : Promise.resolve(null),
  ]);

  const activeItems = items.filter((i) => i.status !== "CANCELADO");
  const servicesCents = sumByType(activeItems, "SERVICO");
  const partsCents = sumByType(activeItems, "PECA");
  const laborCents = sumByType(activeItems, "MAO_DE_OBRA");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 print:gap-3">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href={`/dashboard/os/${workOrder.id}`} className="text-sm text-muted hover:underline">
          ← Voltar para a OS
        </Link>
        <PrintButton label="Imprimir OS" />
      </div>

      <div className="hidden text-center print:block">
        <p className="text-sm font-semibold">BOX 02 — Centro Automotivo</p>
        <p className="text-xs text-muted">Anápolis/GO</p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="font-mono text-xl font-bold">{workOrder.number}</h1>
          <span className="text-sm font-medium">{WORK_ORDER_STATUS_LABEL[workOrder.status]}</span>
        </div>

        <dl className="flex flex-col gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted">Cliente</dt>
            <dd>{customer?.legalName ?? workOrder.customerNameSnapshot}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Veículo</dt>
            <dd>
              {vehicle ? `${vehicle.brand ?? ""} ${vehicle.model ?? ""}`.trim() || "—" : workOrder.vehicleDescriptionSnapshot ?? "—"}
              {workOrder.vehiclePlateSnapshot ? ` · ${formatPlate(workOrder.vehiclePlateSnapshot)}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Quilometragem na recepção</dt>
            <dd>{workOrder.mileageAtEntry.toLocaleString("pt-BR")} km</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Data de entrada</dt>
            <dd>{new Date(workOrder.entryAt).toLocaleString("pt-BR")}</dd>
          </div>
          {workOrder.deliveredAt ? (
            <div>
              <dt className="text-xs text-muted">Data de entrega</dt>
              <dd>{new Date(workOrder.deliveredAt).toLocaleString("pt-BR")}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      {workOrder.diagnosis ? (
        <div className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="mb-1 text-sm font-semibold">Diagnóstico</h2>
          <p className="whitespace-pre-wrap text-sm">{workOrder.diagnosis}</p>
        </div>
      ) : null}

      <div className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="mb-3 text-sm font-semibold">Itens</h2>
        <ul className="flex flex-col gap-2">
          {activeItems.map((item) => (
            <li key={item.id} className="rounded-xl border border-border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted">{ITEM_TYPE_LABEL[item.type]}</span>
                <span className="text-sm font-semibold">{formatBRL(item.totalCents)}</span>
              </div>
              <p className="text-sm">{item.description}</p>
              <p className="text-xs text-muted">
                {Number(item.quantity)} × {formatBRL(item.unitPriceCents)}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded-xl bg-background p-4 text-sm">
          <Row label="Serviços" value={formatBRL(servicesCents)} />
          <Row label="Peças" value={formatBRL(partsCents)} />
          <Row label="Mão de obra" value={formatBRL(laborCents)} />
          {workOrder.discountTotalCents > 0 ? (
            <Row label="Desconto" value={`- ${formatBRL(workOrder.discountTotalCents)}`} />
          ) : null}
          {workOrder.surchargeTotalCents > 0 ? (
            <Row label="Acréscimo" value={`+ ${formatBRL(workOrder.surchargeTotalCents)}`} />
          ) : null}
          <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
            <span>Total</span>
            <span>{formatBRL(workOrder.totalCents)}</span>
          </div>
        </div>
      </div>

      {paymentsSummary ? (
        <div className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="mb-3 text-sm font-semibold">Financeiro</h2>
          <div className="text-sm">
            <Row label="Total devido" value={formatBRL(paymentsSummary.dueCents)} />
            <Row label="Pago" value={formatBRL(paymentsSummary.paidCents)} />
            <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
              <span>Saldo</span>
              <span>{formatBRL(paymentsSummary.remainingCents)}</span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="mb-2 text-sm font-semibold">Assinatura</h2>
        <p className="text-sm text-muted">
          Declaro ter recebido o veículo e conferido os serviços acima descritos.
        </p>
        <div className="mt-10 border-t border-border pt-2 text-xs text-muted">
          {workOrder.deliveryAcceptedName ?? "Nome do cliente"}
          {workOrder.deliveryAcceptedDocument ? ` — ${formatDocument(workOrder.deliveryAcceptedDocument)}` : ""}
        </div>
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

function sumByType(items: { type: string; totalCents: number }[], type: string): number {
  return items.filter((i) => i.type === type).reduce((sum, i) => sum + i.totalCents, 0);
}
