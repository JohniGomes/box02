import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkOrderService } from "@/lib/workOrders/service";
import { getWorkOrderChecklistsService } from "@/lib/workOrders/checklistService";
import { getCustomerService } from "@/lib/customers/service";
import { getVehicleService } from "@/lib/vehicles/service";
import { findUserById } from "@/lib/db/repositories/users";
import { formatPlate } from "@/lib/validation/plate";
import { formatDocument } from "@/lib/validation/document";
import { WORK_ORDER_STATUS_LABEL } from "../../statusLabels";
import { PrintButton } from "@/components/PrintButton";

const ITEM_TYPE_LABEL: Record<string, string> = {
  SERVICO: "Serviço",
  PECA: "Peça",
  MAO_DE_OBRA: "Mão de obra",
};

export default async function EntregaTecnicaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getWorkOrderService(id);
  if (!data) notFound();
  const { workOrder, items } = data;

  const [customer, vehicle, workOrderChecklists] = await Promise.all([
    getCustomerService(workOrder.customerId),
    getVehicleService(workOrder.vehicleId),
    getWorkOrderChecklistsService(workOrder.id),
  ]);

  const deliveredByUser = workOrder.deliveredByUserId ? await findUserById(workOrder.deliveredByUserId) : null;

  const executedItems = items.filter((i) => i.status === "EXECUTADO" && i.origin !== "ADICIONAL_DURANTE_EXECUCAO");
  const executedAdditionalItems = items.filter(
    (i) => i.status === "EXECUTADO" && i.origin === "ADICIONAL_DURANTE_EXECUCAO",
  );

  const entregaChecklist = workOrderChecklists.find((c) => c.checklist.type === "ENTREGA") ?? null;

  const delivered = workOrder.status === "ENTREGUE";

  const customerPhone = customer?.whatsapp ?? customer?.phone ?? null;
  let whatsappHref: string | null = null;
  if (customerPhone) {
    const digits = customerPhone.replace(/\D/g, "");
    const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
    const situationText = workOrder.technicalNotes ? ` ${workOrder.technicalNotes}` : "";
    const text = encodeURIComponent(
      `Olá! Sua OS ${workOrder.number} foi concluída.${situationText} Qualquer dúvida, estamos à disposição.`,
    );
    whatsappHref = `https://wa.me/${withCountry}?text=${text}`;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 print:gap-3">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href={`/dashboard/os/${workOrder.id}`} className="text-sm text-muted hover:underline">
          ← Voltar para a OS
        </Link>
        <PrintButton />
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6">
        <h1 className="mb-1 text-lg font-semibold tracking-tight">Entrega Técnica</h1>
        <p className="mb-4 text-xs text-muted">
          OS {workOrder.number} · Status atual: {WORK_ORDER_STATUS_LABEL[workOrder.status]}
        </p>

        <dl className="flex flex-col gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted">Cliente</dt>
            <dd>{customer?.legalName ?? workOrder.customerNameSnapshot}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Veículo</dt>
            <dd>
              {vehicle ? `${vehicle.brand ?? ""} ${vehicle.model ?? ""}`.trim() || "—" : workOrder.vehicleDescriptionSnapshot ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Placa</dt>
            <dd>{workOrder.vehiclePlateSnapshot ? formatPlate(workOrder.vehiclePlateSnapshot) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Diagnóstico técnico</dt>
            <dd className="whitespace-pre-wrap">{workOrder.diagnosis ?? "Nenhum diagnóstico registrado."}</dd>
          </div>

          <div>
            <dt className="mb-1 text-xs text-muted">Serviços executados</dt>
            {executedItems.length === 0 ? (
              <dd className="text-muted">Nenhum serviço marcado como executado.</dd>
            ) : (
              <dd>
                <ul className="flex flex-col gap-1">
                  {executedItems.map((item) => (
                    <li key={item.id} className="text-sm">
                      <span className="text-xs text-muted">{ITEM_TYPE_LABEL[item.type]}</span> — {item.description}
                    </li>
                  ))}
                </ul>
              </dd>
            )}
          </div>

          <div>
            <dt className="mb-1 text-xs text-muted">Adicionais realizados</dt>
            {executedAdditionalItems.length === 0 ? (
              <dd className="text-muted">Nenhum adicional executado.</dd>
            ) : (
              <dd>
                <ul className="flex flex-col gap-1">
                  {executedAdditionalItems.map((item) => (
                    <li key={item.id} className="text-sm">{item.description}</li>
                  ))}
                </ul>
              </dd>
            )}
          </div>

          <div>
            <dt className="mb-1 text-xs text-muted">Verificação final (checklist de entrega)</dt>
            {entregaChecklist ? (
              <dd>
                <p className="mb-1 text-xs font-medium">{entregaChecklist.checklist.code} — {entregaChecklist.checklist.name}</p>
                <ul className="flex flex-col gap-1">
                  {entregaChecklist.items.map((item) => (
                    <li key={item.id} className="flex items-start gap-2 text-sm">
                      <span>{item.checked ? "☑" : "☐"}</span>
                      <span>{item.description}</span>
                    </li>
                  ))}
                </ul>
              </dd>
            ) : (
              <dd className="text-muted">Checklist de entrega não foi utilizado nesta OS.</dd>
            )}
          </div>

          <div>
            <dt className="text-xs text-muted">Registro técnico da entrega</dt>
            <dd className="whitespace-pre-wrap">
              {workOrder.technicalNotes ?? "Nenhum registro técnico informado ainda."}
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="mb-2 text-sm font-semibold">Entrega</h2>
        {delivered ? (
          <dl className="flex flex-col gap-1 text-sm">
            <div>
              <dt className="inline text-xs text-muted">Data/hora: </dt>
              <dd className="inline">{workOrder.deliveredAt ? new Date(workOrder.deliveredAt).toLocaleString("pt-BR") : "—"}</dd>
            </div>
            <div>
              <dt className="inline text-xs text-muted">Recebido por: </dt>
              <dd className="inline">{workOrder.deliveryAcceptedName ?? "—"}</dd>
            </div>
            {workOrder.deliveryAcceptedDocument ? (
              <div>
                <dt className="inline text-xs text-muted">Documento: </dt>
                <dd className="inline">{formatDocument(workOrder.deliveryAcceptedDocument)}</dd>
              </div>
            ) : null}
            <div>
              <dt className="inline text-xs text-muted">Responsável interno pela entrega: </dt>
              <dd className="inline">{deliveredByUser?.name ?? "—"}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted">Entrega ainda não realizada.</p>
        )}
      </div>

      {whatsappHref ? (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="print:hidden flex h-12 items-center justify-center rounded-xl bg-accent text-base font-semibold text-accent-foreground"
        >
          Enviar por WhatsApp
        </a>
      ) : null}
    </div>
  );
}
