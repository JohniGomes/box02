import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkOrderPaymentsSummaryService, getWorkOrderService } from "@/lib/workOrders/service";
import { getCustomerService } from "@/lib/customers/service";
import { getVehicleService } from "@/lib/vehicles/service";
import { formatBRL } from "@/lib/money";
import { formatPlate } from "@/lib/validation/plate";
import { formatDocument } from "@/lib/validation/document";
import { PrintButton } from "@/components/PrintButton";
import { formatDateBR } from "@/lib/dateBr";

const ITEM_TYPE_LABEL: Record<string, string> = {
  SERVICO: "Serviço",
  PECA: "Peça",
  MAO_DE_OBRA: "Mão de obra",
};

const METHOD_LABEL: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "Pix",
  CARTAO: "Cartão",
  OUTRO: "Outro",
};

const STATUS_LABEL: Record<string, string> = {
  QUITADO: "Quitado",
  PARCIALMENTE_PAGO: "Parcialmente pago",
  EM_ABERTO: "Em aberto",
};

function formatDate(d: Date | string): string {
  return formatDateBR(d);
}

/**
 * Recibo de pagamento para entregar ao cliente: comprova o que foi feito e
 * quanto/como foi pago. Pronto para imprimir ou salvar em PDF (botão
 * Imprimir → "Salvar como PDF") e para mandar resumo pelo WhatsApp.
 * Mesmo padrão do Termo de Recepção / Entrega Técnica.
 */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getWorkOrderService(id);
  if (!data) notFound();
  const { workOrder, items } = data;

  const [customer, vehicle, summary] = await Promise.all([
    getCustomerService(workOrder.customerId),
    getVehicleService(workOrder.vehicleId),
    workOrder.status === "ENTREGUE" ? getWorkOrderPaymentsSummaryService(workOrder.id) : Promise.resolve(null),
  ]);

  const executedItems = items.filter((i) => i.status === "EXECUTADO");
  const customerName = customer?.legalName ?? workOrder.customerNameSnapshot ?? "Cliente";
  const vehicleText =
    (vehicle ? `${vehicle.brand ?? ""} ${vehicle.model ?? ""}`.trim() : workOrder.vehicleDescriptionSnapshot) || "—";
  const plate = workOrder.vehiclePlateSnapshot ? formatPlate(workOrder.vehiclePlateSnapshot) : null;
  const serviceDate = workOrder.deliveredAt ?? workOrder.entryAt;

  // Pagamento estornado não aparece como pagamento: some se foi estornado por
  // inteiro e mostra só o líquido se foi em parte. A soma das linhas = total pago.
  const receiptPayments = (summary?.payments ?? [])
    .map((p) => ({
      ...p,
      netCents: p.amountCents - (summary?.refunds ?? []).filter((r) => r.paymentId === p.id).reduce((s, r) => s + r.refundCents, 0),
    }))
    .filter((p) => p.netCents > 0);
  // Rodapé: data do último pagamento (a do recibo de fato), senão a do atendimento.
  const lastPaymentAt = receiptPayments.reduce<Date | null>(
    (acc, p) => (!acc || p.receivedAt > acc ? p.receivedAt : acc),
    null,
  );
  const footerDate = lastPaymentAt ?? serviceDate;

  const customerPhone = customer?.whatsapp ?? customer?.phone ?? null;
  let whatsappHref: string | null = null;
  if (customerPhone && summary && summary.paidCents > 0) {
    const digits = customerPhone.replace(/\D/g, "");
    const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
    const methods = receiptPayments.map((p) => `${METHOD_LABEL[p.method] ?? p.method} ${formatBRL(p.netCents)}`).join(" + ");
    const text = encodeURIComponent(
      `Olá! Segue o resumo do seu atendimento na BOX 02 — OS ${workOrder.number}, veículo ${vehicleText}${plate ? ` (${plate})` : ""}, em ${formatDate(serviceDate)}.\n` +
        `Total: ${formatBRL(summary.dueCents)}. Pago: ${formatBRL(summary.paidCents)} (${methods}). ` +
        `${summary.discountCents > 0 ? `Desconto: ${formatBRL(summary.discountCents)}. ` : ""}` +
        `${summary.status === "QUITADO" ? "Serviço quitado. " : ""}` +
        `Obrigado pela confiança! Qualquer dúvida, estamos à disposição.`,
    );
    whatsappHref = `https://wa.me/${withCountry}?text=${text}`;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 print:gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/dashboard/os/${workOrder.id}`} className="text-sm text-muted hover:underline">
          ← Voltar para a OS
        </Link>
        <div className="flex gap-2">
          {whatsappHref ? (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center rounded-xl border border-border px-4 text-sm font-medium"
            >
              Enviar resumo no WhatsApp
            </a>
          ) : null}
          <PrintButton label="Imprimir / salvar PDF" />
        </div>
      </div>

      {!summary ? (
        <div className="rounded-2xl border border-border bg-surface p-6 text-sm">
          O recibo só fica disponível depois que a OS é entregue e há pagamento registrado.
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-border bg-surface p-6">
            <div className="mb-4 text-center">
              <p className="text-base font-semibold">BOX 02 — Centro Automotivo</p>
              <p className="text-xs text-muted">Anápolis/GO</p>
            </div>

            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-lg font-semibold tracking-tight">Recibo de pagamento</h1>
              <span className="font-mono text-sm font-semibold">{workOrder.number}</span>
            </div>

            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted">Cliente</dt>
                <dd>
                  {customerName}
                  {customer?.document ? ` — ${formatDocument(customer.document)}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Veículo</dt>
                <dd>
                  {vehicleText}
                  {plate ? ` · ${plate}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Data do atendimento</dt>
                <dd>{formatDate(serviceDate)}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="mb-3 text-sm font-semibold">Serviços realizados</h2>
            <ul className="flex flex-col gap-2">
              {executedItems.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                  <span>
                    <span className="block text-xs text-muted">{ITEM_TYPE_LABEL[item.type]}</span>
                    {item.description}
                    <span className="block text-xs text-muted">
                      {Number(item.quantity)} × {formatBRL(item.unitPriceCents)}
                    </span>
                  </span>
                  <span className="font-semibold">{formatBRL(item.totalCents)}</span>
                </li>
              ))}
            </ul>
            {workOrder.discountTotalCents > 0 || workOrder.surchargeTotalCents > 0 ? (
              <div className="mt-3 border-t border-border pt-3 text-sm text-muted">
                {workOrder.discountTotalCents > 0 ? (
                  <div className="flex justify-between">
                    <span>Desconto</span>
                    <span>- {formatBRL(workOrder.discountTotalCents)}</span>
                  </div>
                ) : null}
                {workOrder.surchargeTotalCents > 0 ? (
                  <div className="flex justify-between">
                    <span>Acréscimo</span>
                    <span>+ {formatBRL(workOrder.surchargeTotalCents)}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="mt-3 flex justify-between border-t border-border pt-3 font-semibold">
              <span>Total do serviço</span>
              <span>{formatBRL(summary.dueCents)}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="mb-3 text-sm font-semibold">Pagamento</h2>
            {receiptPayments.length === 0 ? (
              <p className="text-sm text-muted">Nenhum pagamento registrado.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {receiptPayments.map((p) => (
                  <li key={p.id} className="flex justify-between text-sm">
                    <span>
                      {METHOD_LABEL[p.method] ?? p.method}
                      <span className="text-muted"> · {formatDate(p.receivedAt)}</span>
                    </span>
                    <span className="font-semibold">{formatBRL(p.netCents)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 border-t border-border pt-3 text-sm">
              <div className="flex justify-between text-muted">
                <span>Total pago</span>
                <span className="text-foreground">{formatBRL(summary.paidCents)}</span>
              </div>
              {summary.discountCents > 0 ? (
                <div className="flex justify-between text-muted">
                  <span>Desconto concedido</span>
                  <span className="text-foreground">- {formatBRL(summary.discountCents)}</span>
                </div>
              ) : null}
              {summary.remainingCents > 0 ? (
                <div className="flex justify-between text-muted">
                  <span>Saldo em aberto</span>
                  <span className="text-foreground">{formatBRL(summary.remainingCents)}</span>
                </div>
              ) : null}
              <div className="mt-2 flex justify-between font-semibold">
                <span>Situação</span>
                <span>{STATUS_LABEL[summary.status]}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6">
            <p className="text-sm">
              Recebemos de <span className="font-medium">{customerName}</span> a importância de{" "}
              <span className="font-medium">{formatBRL(summary.paidCents)}</span>, referente aos serviços acima
              descritos (OS {workOrder.number}).
            </p>
            <div className="mt-10 border-t border-border pt-2 text-xs text-muted">
              BOX 02 — Centro Automotivo · Anápolis/GO, {formatDate(footerDate)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
