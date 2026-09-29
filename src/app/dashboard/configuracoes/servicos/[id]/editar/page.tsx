import Link from "next/link";
import { notFound } from "next/navigation";
import { getServiceService } from "@/lib/services/service";
import { centsToReais } from "@/lib/money";
import { ServiceForm } from "../../ServiceForm";

export default async function EditServicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const service = await getServiceService(id);
  if (!service) notFound();

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/dashboard/configuracoes/servicos/${id}`} className="text-sm text-muted hover:underline">
        ← {service.name}
      </Link>
      <h1 className="text-lg font-semibold tracking-tight">Editar serviço</h1>
      <ServiceForm
        serviceId={service.id}
        initial={{
          name: service.name,
          category: service.category ?? "",
          defaultPriceReais: service.defaultPriceCents !== null ? centsToReais(service.defaultPriceCents) : "",
          costReais: service.costCents !== null ? centsToReais(service.costCents) : "",
        }}
      />
    </div>
  );
}
