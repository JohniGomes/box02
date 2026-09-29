import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getQuoteService } from "@/lib/quotes/service";
import { getCustomerService } from "@/lib/customers/service";
import { getVehicleService } from "@/lib/vehicles/service";
import { formatDocument } from "@/lib/validation/document";
import { formatPlate } from "@/lib/validation/plate";
import { centsToReais } from "@/lib/money";
import { toDateOnlyLocal } from "@/lib/dateOnly";
import { QuoteForm, type QuoteFormInitialValues } from "../../QuoteForm";

export default async function EditQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getQuoteService(id);
  if (!data) notFound();

  const { quote, version, items } = data;

  if (version.status !== "RASCUNHO") {
    redirect(`/dashboard/orcamentos/${quote.id}`);
  }

  const [customer, vehicle] = await Promise.all([
    getCustomerService(quote.customerId),
    getVehicleService(quote.vehicleId),
  ]);
  if (!customer || !vehicle) notFound();

  const initialValues: QuoteFormInitialValues = {
    customer: {
      id: customer.id,
      label: customer.document ? `${customer.legalName} · ${formatDocument(customer.document)}` : customer.legalName,
    },
    vehicle: {
      id: vehicle.id,
      label: [vehicle.plate ? formatPlate(vehicle.plate) : "Sem placa", [vehicle.brand, vehicle.model].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(" — "),
    },
    items: items.map((item) => ({
      key: item.id,
      type: item.type,
      description: item.description,
      quantity: String(Number(item.quantity)),
      unitPriceReais: centsToReais(item.unitPriceCents),
      serviceId: item.serviceId ?? undefined,
      category: item.category,
    })),
    discountType: version.discountType ?? "",
    discountValue:
      version.discountType === "PERCENTUAL"
        ? String((version.discountValue ?? 0) / 100)
        : version.discountType === "FIXO"
          ? centsToReais(version.discountValue ?? 0)
          : "",
    surchargeType: version.surchargeType ?? "",
    surchargeValue:
      version.surchargeType === "PERCENTUAL"
        ? String((version.surchargeValue ?? 0) / 100)
        : version.surchargeType === "FIXO"
          ? centsToReais(version.surchargeValue ?? 0)
          : "",
    validUntil: toDateOnlyLocal(new Date(version.validUntil)),
    internalNotes: version.internalNotes ?? "",
    customerMessage: version.customerMessage ?? "",
  };

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={`/dashboard/orcamentos/${quote.id}`}
        className="text-sm text-muted underline-offset-2 hover:underline"
      >
        ← {quote.number}
      </Link>
      <h1 className="text-lg font-semibold tracking-tight">Editar orçamento</h1>
      <QuoteForm mode="edit" quoteId={quote.id} initialValues={initialValues} />
    </div>
  );
}
