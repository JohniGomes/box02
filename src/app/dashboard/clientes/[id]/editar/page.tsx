import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomerService } from "@/lib/customers/service";
import { CustomerForm, customerRecordToFormValues } from "../../CustomerForm";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await getCustomerService(id);
  if (!customer) notFound();

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={`/dashboard/clientes/${customer.id}`}
        className="text-sm text-muted underline-offset-2 hover:underline"
      >
        ← {customer.legalName}
      </Link>
      <h1 className="text-lg font-semibold tracking-tight">Editar cliente</h1>
      <CustomerForm
        mode="edit"
        customerId={customer.id}
        initialValues={customerRecordToFormValues(customer)}
      />
    </div>
  );
}
