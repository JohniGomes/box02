import Link from "next/link";
import { CustomerForm } from "../CustomerForm";

export default function NewCustomerPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/clientes"
          className="text-sm text-muted underline-offset-2 hover:underline"
        >
          ← Clientes
        </Link>
      </div>
      <h1 className="text-lg font-semibold tracking-tight">Novo cliente</h1>
      <CustomerForm mode="create" />
    </div>
  );
}
