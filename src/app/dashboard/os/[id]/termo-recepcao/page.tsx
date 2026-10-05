import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkOrderService } from "@/lib/workOrders/service";
import { getWorkOrderChecklistsService } from "@/lib/workOrders/checklistService";
import { getCustomerService } from "@/lib/customers/service";
import { getVehicleService } from "@/lib/vehicles/service";
import { formatPlate } from "@/lib/validation/plate";
import type { ReceptionChecklistSnapshot } from "@/lib/db/repositories/workOrders";
import { PrintButton } from "@/components/PrintButton";

export default async function TermoRecepcaoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getWorkOrderService(id);
  if (!data) notFound();
  const { workOrder } = data;

  const [customer, vehicle] = await Promise.all([
    getCustomerService(workOrder.customerId),
    getVehicleService(workOrder.vehicleId),
  ]);

  const accepted = Boolean(workOrder.receptionAcceptedAt);

  // Documento congelado (depois do aceite): lê só dos snapshots, nunca
  // dos campos "vivos" da OS. Prévia dinâmica (antes do aceite): lê os
  // dados atuais, incluindo o estado corrente do checklist de entrada,
  // se houver uma instância em andamento.
  let checklistToShow: ReceptionChecklistSnapshot | null = null;
  if (accepted) {
    checklistToShow = workOrder.receptionChecklistSnapshot;
  } else {
    const checklists = await getWorkOrderChecklistsService(workOrder.id);
    const entrada = checklists.find((c) => c.checklist.type === "ENTRADA");
    if (entrada) {
      checklistToShow = {
        code: entrada.checklist.code,
        name: entrada.checklist.name,
        items: entrada.items.map((i) => ({
          description: i.description,
          required: i.required,
          sortOrder: i.sortOrder,
          checked: i.checked,
        })),
      };
    }
  }

  const complaint = accepted ? workOrder.receptionComplaintSnapshot : workOrder.customerComplaint;
  const damages = accepted ? workOrder.receptionDamagesSnapshot : workOrder.preExistingDamagesDescription;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 print:gap-3">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href={`/dashboard/os/${workOrder.id}`} className="text-sm text-muted hover:underline">
          ← Voltar para a OS
        </Link>
        <PrintButton />
      </div>

      <div className="print:hidden">
        {accepted ? (
          <div className="rounded-xl border border-success/30 bg-success/5 p-3 text-center text-sm font-medium text-success">
            Documento congelado — representa o estado exato no momento do aceite.
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-accent/40 bg-accent/5 p-3 text-center text-sm font-medium text-accent">
            Prévia dinâmica — Termo ainda pendente de aceite. O conteúdo abaixo reflete os dados
            disponíveis agora e pode mudar até o aceite ser registrado.
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6">
        <h1 className="mb-1 text-lg font-semibold tracking-tight">Termo de Recepção</h1>
        <p className="mb-4 text-xs text-muted">OS {workOrder.number}</p>

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
            <dt className="text-xs text-muted">Data e hora da recepção</dt>
            <dd>{new Date(workOrder.entryAt).toLocaleString("pt-BR")}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Queixa relatada</dt>
            <dd className="whitespace-pre-wrap">{complaint ?? "Nenhuma queixa registrada."}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Avarias preexistentes declaradas</dt>
            <dd className="whitespace-pre-wrap">{damages ?? "Nenhuma avaria declarada."}</dd>
          </div>

          <div>
            <dt className="mb-1 text-xs text-muted">
              Checklist de entrada {accepted ? "(estado no momento do aceite)" : "(estado atual)"}
            </dt>
            {checklistToShow ? (
              <dd>
                <p className="mb-1 text-xs font-medium">{checklistToShow.code} — {checklistToShow.name}</p>
                <ul className="flex flex-col gap-1">
                  {checklistToShow.items
                    .slice()
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <span>{item.checked ? "☑" : "☐"}</span>
                        <span>
                          {item.description}
                          {item.required ? <span className="ml-1 text-[10px] text-danger">obrigatório</span> : null}
                        </span>
                      </li>
                    ))}
                </ul>
              </dd>
            ) : (
              <dd className="text-muted">Checklist de entrada não foi utilizado nesta recepção.</dd>
            )}
          </div>
        </dl>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="mb-2 text-sm font-semibold">Aceite e autorização de diagnóstico</h2>
        {accepted ? (
          <div className="flex flex-col gap-2 text-sm">
            <p>
              Declaro estar ciente das informações de recepção acima, incluindo o estado aparente do
              veículo e as avarias preexistentes declaradas, e autorizo a oficina a realizar o
              diagnóstico do veículo.
            </p>
            <dl className="mt-2 flex flex-col gap-1 text-xs">
              <div>
                <dt className="inline text-muted">Aceito por: </dt>
                <dd className="inline">{workOrder.receptionAcceptedName}</dd>
              </div>
              {workOrder.receptionAcceptedDocument ? (
                <div>
                  <dt className="inline text-muted">CPF: </dt>
                  <dd className="inline">{workOrder.receptionAcceptedDocument}</dd>
                </div>
              ) : null}
              <div>
                <dt className="inline text-muted">Data/hora do aceite: </dt>
                <dd className="inline">{new Date(workOrder.receptionAcceptedAt!).toLocaleString("pt-BR")}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="text-sm text-muted">
            Aceite ainda não registrado. Registre o aceite na ficha da OS para congelar este Termo.
          </p>
        )}
      </div>
    </div>
  );
}
