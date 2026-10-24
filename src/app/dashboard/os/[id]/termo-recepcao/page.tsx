import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkOrderService } from "@/lib/workOrders/service";
import { getWorkOrderChecklistsService } from "@/lib/workOrders/checklistService";
import { getCustomerService } from "@/lib/customers/service";
import { getVehicleService } from "@/lib/vehicles/service";
import { findUserById } from "@/lib/db/repositories/users";
import { formatPlate } from "@/lib/validation/plate";
import { formatPhone } from "@/lib/validation/phone";
import type { ReceptionChecklistSnapshot } from "@/lib/db/repositories/workOrders";
import { PdfStyleHeader } from "@/components/PdfStyleHeader";
import { PrintButton } from "@/components/PrintButton";
import { vehicleDisplayName } from "@/lib/vehicles/label";
import { formatDocument } from "@/lib/validation/document";
import { DamagesEditor } from "../DamagesEditor";
import { CheckInEditor } from "../CheckInEditor";
import { ReceptionAcceptForm } from "../ReceptionAcceptForm";
import { formatDateTimeBR } from "@/lib/dateBr";

export default async function TermoRecepcaoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getWorkOrderService(id);
  if (!data) notFound();
  const { workOrder } = data;

  const accepted = Boolean(workOrder.receptionAcceptedAt);

  const [customer, vehicle, receivedBy] = await Promise.all([
    getCustomerService(workOrder.customerId),
    getVehicleService(workOrder.vehicleId),
    workOrder.receivedByUserId ? findUserById(workOrder.receivedByUserId) : Promise.resolve(null),
  ]);

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
          status: i.status,
          observacao: i.observacao,
        })),
      };
    }
  }

  const missingForAccept: string[] = [];
  if (!workOrder.customerComplaint || workOrder.customerComplaint.trim() === "") missingForAccept.push("a queixa do cliente");
  if (workOrder.mileageAtEntry === null) missingForAccept.push("o KM do painel");

  const complaint = accepted ? workOrder.receptionComplaintSnapshot : workOrder.customerComplaint;
  const damages = accepted ? workOrder.receptionDamagesSnapshot : workOrder.preExistingDamagesDescription;
  const phone = customer?.whatsapp ?? customer?.phone ?? null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 print:gap-2">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href={`/dashboard/os/${workOrder.id}`} className="text-sm text-muted hover:underline">
          ← Voltar para a OS
        </Link>
        <PrintButton label="Imprimir Termo" />
      </div>

      <PdfStyleHeader title="Termo de Recepção" subtitle="Ciência do cliente e autorização de diagnóstico" />

      {accepted ? (
        <div className="rounded-xl border border-success/30 bg-success/5 p-3 text-center text-sm font-medium text-success print:hidden">
          Documento congelado — representa o estado exato no momento do aceite.
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-accent/40 bg-accent/5 p-3 text-center text-sm font-medium text-accent print:hidden">
          Prévia dinâmica — pendente de aceite. O conteúdo abaixo pode mudar até o aceite ser registrado.
        </div>
      )}

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border text-sm">
        <Field label="Nº da OS / PROV" value={workOrder.number} />
        <Field label="Data / hora" value={formatDateTimeBR(workOrder.entryAt)} />
        <Field label="Placa" value={workOrder.vehiclePlateSnapshot ? formatPlate(workOrder.vehiclePlateSnapshot) : "—"} />
        <Field label="Recebido por" value={receivedBy?.name ?? "—"} />
        <Field label="Cliente" value={customer?.legalName ?? workOrder.customerNameSnapshot} />
        <Field label="Telefone / WhatsApp" value={phone ? formatPhone(phone) : "—"} />
        <Field
          label="Veículo (marca / modelo)"
          value={
            vehicleDisplayName(vehicle, workOrder.vehicleDescriptionSnapshot) ??
            (workOrder.vehiclePlateSnapshot ? `Placa ${formatPlate(workOrder.vehiclePlateSnapshot)}` : "—")
          }
        />
        <Field label="Km (painel)" value={workOrder.mileageAtEntry != null ? `${workOrder.mileageAtEntry.toLocaleString("pt-BR")} km` : "Não informado"} />
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="mb-2 text-sm font-bold uppercase">Queixa relatada pelo cliente</h2>
        {accepted ? (
          <p className="whitespace-pre-wrap text-sm">{complaint ?? "Nenhuma queixa registrada."}</p>
        ) : (
          <CheckInEditor
            workOrderId={workOrder.id}
            initialComplaint={workOrder.customerComplaint}
            initialMileage={workOrder.mileageAtEntry}
          />
        )}
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="mb-2 text-sm font-bold uppercase">Avarias preexistentes declaradas</h2>
        <DamagesEditor workOrderId={workOrder.id} initialValue={damages} locked={accepted} />
      </div>

      {checklistToShow ? (
        <div className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="mb-1 text-sm font-bold uppercase">
            Checklist de entrada {accepted ? "(estado no momento do aceite)" : "(estado atual)"}
          </h2>
          <p className="mb-2 text-xs text-muted">{checklistToShow.code} — {checklistToShow.name}</p>
          <ul className="flex flex-col gap-1">
            {checklistToShow.items
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((item, idx) => (
                <li key={idx} className="flex flex-col gap-0.5 text-sm">
                  <span className="flex items-start gap-2">
                    <span className="font-medium">
                      {item.status === "OK"
                        ? "OK"
                        : item.status === "ATENCAO"
                          ? "Atenção"
                          : item.status === "NA"
                            ? "N/A"
                            : "☐"}
                    </span>
                    <span>
                      {item.description}
                      {item.required ? <span className="ml-1 text-[10px] text-danger">obrigatório</span> : null}
                    </span>
                  </span>
                  {item.observacao ? <span className="ml-6 text-xs text-muted">Obs.: {item.observacao}</span> : null}
                </li>
              ))}
          </ul>
          <Link
            href={`/dashboard/os/${workOrder.id}/checklist-entrada`}
            className="mt-3 inline-block text-xs font-medium text-accent print:hidden"
          >
            Abrir checklist de entrada →
          </Link>
        </div>
      ) : null}

      {!accepted ? (
        <ReceptionAcceptForm
          workOrderId={workOrder.id}
          missing={missingForAccept}
          defaultName={customer?.legalName ?? workOrder.customerNameSnapshot}
          defaultDocument={
            customer?.document && customer.document.replace(/\D/g, "").length === 11 ? formatDocument(customer.document) : ""
          }
        />
      ) : (
        <>
          <div className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="mb-2 text-sm font-bold uppercase">Ciência do cliente</h2>
            <ul className="flex flex-col gap-2 text-sm">
              <li className="flex items-start gap-2">
                <span>{workOrder.receptionAwareness1 ? "☑" : "☐"}</span>
                <span>
                  Fui informado(a) de que o veículo pode ter desgastes ou problemas já existentes, que só aparecem
                  quando a oficina testa, desmonta ou liga o carro. Se isso acontecer, a oficina me avisa e
                  apresenta orçamento separado. Nada será feito sem minha autorização.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span>{workOrder.receptionAwareness2 ? "☑" : "☐"}</span>
                <span>
                  Fui informado(a) de que carro parado por muito tempo pode ter bateria fraca, combustível e
                  fluidos degradados e borrachas/mangueiras ressecadas, e que isso pode aparecer depois que o
                  carro volta a ser usado.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span>{workOrder.receptionAwareness3 ? "☑" : "☐"}</span>
                <span>Esta ciência não retira a responsabilidade da oficina pelo serviço que ela executar.</span>
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="mb-2 text-sm font-bold uppercase">Aceite e autorização de diagnóstico</h2>
            <p className="text-sm">
              Declaro estar ciente das informações de recepção acima, incluindo o estado aparente do veículo e as
              avarias preexistentes declaradas, e autorizo a oficina a realizar o diagnóstico do veículo.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border text-sm">
              <Field label="Aceito por" value={workOrder.receptionAcceptedName ?? "—"} />
              <Field label="CPF" value={workOrder.receptionAcceptedDocument ?? "—"} />
              <Field
                label="Data / hora"
                value={workOrder.receptionAcceptedAt ? formatDateTimeBR(workOrder.receptionAcceptedAt) : "—"}
              />
              <Field label="Recebido por" value={receivedBy?.name ?? "—"} />
            </div>
          </div>
        </>
      )}
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
