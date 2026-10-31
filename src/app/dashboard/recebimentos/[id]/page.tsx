import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkOrderPaymentsSummaryService, getWorkOrderService } from "@/lib/workOrders/service";
import { getCustomerService } from "@/lib/customers/service";
import { formatPlate } from "@/lib/validation/plate";
import { WorkOrderPaymentsSection } from "../../os/[id]/WorkOrderPaymentsSection";
import { toPaymentsSummaryView } from "../../os/[id]/paymentsView";

/** Ficha de pagamento de uma OS: receber, ver pagamentos, estornar, taxa do cartão e recibo. */
export default async function PaymentFilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getWorkOrderService(id);
  if (!data) notFound();
  const { workOrder } = data;

  const [customer, summary] = await Promise.all([
    getCustomerService(workOrder.customerId),
    workOrder.status === "ENTREGUE" ? getWorkOrderPaymentsSummaryService(workOrder.id) : Promise.resolve(null),
  ]);
  const customerName = customer?.legalName ?? workOrder.customerNameSnapshot ?? "Cliente";

  return (
    <div className="flex flex-col gap-4">
      <Link href="/dashboard/recebimentos" className="text-xs font-medium text-muted underline">
        ← Recebimentos
      </Link>
      <div>
        <h1 className="text-lg font-semibold tracking-tight">
          <span className="font-mono">{workOrder.number}</span> · {customerName}
        </h1>
        <p className="text-sm text-muted">
          {workOrder.vehiclePlateSnapshot ? `${formatPlate(workOrder.vehiclePlateSnapshot)} · ` : ""}
          {workOrder.vehicleDescriptionSnapshot ?? ""}
        </p>
        <Link href={`/dashboard/os/${workOrder.id}/detalhes`} className="text-xs font-medium text-accent">
          Abrir a OS →
        </Link>
      </div>
      {summary ? (
        <WorkOrderPaymentsSection
          workOrderId={workOrder.id}
          sectionId="ficha-pagamento"
          entryDate={workOrder.entryAt.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })}
          summary={toPaymentsSummaryView(summary)}
        />
      ) : (
        <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          Esta OS ainda não foi entregue. O recebimento é registrado depois da entrega.
        </p>
      )}
    </div>
  );
}
