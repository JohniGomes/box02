import Link from "next/link";
import { notFound } from "next/navigation";
import { getVehicleService } from "@/lib/vehicles/service";
import { getCustomerService } from "@/lib/customers/service";
import { formatPlate } from "@/lib/validation/plate";
import { VehicleForm, vehicleRecordToFormValues } from "../../VehicleForm";

export default async function EditVehiclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const vehicle = await getVehicleService(id);
  if (!vehicle) notFound();

  const customer = await getCustomerService(vehicle.customerId);
  const customerLabel = customer?.legalName ?? "Cliente não encontrado";

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={`/dashboard/veiculos/${vehicle.id}`}
        className="text-sm text-muted underline-offset-2 hover:underline"
      >
        ← {vehicle.plate ? formatPlate(vehicle.plate) : "Veículo"}
      </Link>
      <h1 className="text-lg font-semibold tracking-tight">Editar veículo</h1>
      <VehicleForm
        mode="edit"
        vehicleId={vehicle.id}
        initialValues={vehicleRecordToFormValues(vehicle, customerLabel)}
        fixedCustomer={{ id: vehicle.customerId, label: customerLabel }}
      />
    </div>
  );
}
