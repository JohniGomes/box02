import Link from "next/link";
import { notFound } from "next/navigation";
import { getServiceService, getSuggestedPriceForService } from "@/lib/services/service";
import { formatBRL } from "@/lib/money";
import { ServiceStatusToggle } from "./ServiceStatusToggle";
import { ServiceProcedureChecklistAssociation } from "../ServiceProcedureChecklistAssociation";

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const service = await getServiceService(id);
  if (!service) notFound();
  const suggested = await getSuggestedPriceForService(service);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/configuracoes/servicos" className="text-sm text-muted hover:underline">
        ← Serviços
      </Link>

      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold tracking-tight">{service.name}</h1>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            service.status === "ATIVO" ? "bg-success/15 text-success" : "bg-muted/20 text-muted"
          }`}
        >
          {service.status === "ATIVO" ? "Ativo" : "Inativo"}
        </span>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <dl className="flex flex-col gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted">Categoria</dt>
            <dd>{service.category ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Preço padrão</dt>
            <dd>{service.defaultPriceCents !== null ? formatBRL(service.defaultPriceCents) : "Variável (sem preço fixo)"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Custo estimado (interno)</dt>
            <dd>{service.costCents !== null ? formatBRL(service.costCents) : "Não informado"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Preço sugerido (referência interna, para conferência)</dt>
            <dd>
              {suggested ? (
                <>
                  {formatBRL(suggested.cents)}{" "}
                  <span className="text-xs text-muted">
                    (Fonte: {suggested.source === "manual" ? "definido manualmente" : "custo + markup"})
                  </span>
                </>
              ) : (
                <span className="text-muted">
                  Sem sugestão disponível
                  {service.costCents !== null ? " — configure o markup padrão em Configurações → Precificação" : ""}
                </span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <ServiceProcedureChecklistAssociation
        serviceId={service.id}
        currentProcedureId={service.procedureId}
        currentChecklistId={service.executionChecklistId}
      />

      <div className="flex flex-col gap-3">
        <Link
          href={`/dashboard/configuracoes/servicos/${service.id}/editar`}
          className="flex h-12 items-center justify-center rounded-xl border border-border text-base font-semibold"
        >
          Editar
        </Link>
        <ServiceStatusToggle serviceId={service.id} status={service.status} />
      </div>
    </div>
  );
}
