import Link from "next/link";
import { getCustomerService } from "@/lib/customers/service";
import { VehicleForm } from "../VehicleForm";

export default async function NewVehiclePage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const { customerId } = await searchParams;

  let fixedCustomer: { id: string; label: string } | undefined;
  if (customerId) {
    const customer = await getCustomerService(customerId);
    if (customer) {
      fixedCustomer = { id: customer.id, label: customer.legalName };
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={fixedCustomer ? `/dashboard/clientes/${fixedCustomer.id}` : "/dashboard/veiculos"}
        className="text-sm text-muted underline-offset-2 hover:underline"
      >
        ← {fixedCustomer ? fixedCustomer.label : "Veículos"}
      </Link>
      <h1 className="text-lg font-semibold tracking-tight">Novo veículo</h1>
      <VehicleForm mode="create" fixedCustomer={fixedCustomer} />
    </div>
  );
}
