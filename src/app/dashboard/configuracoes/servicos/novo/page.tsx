import Link from "next/link";
import { ServiceForm } from "../ServiceForm";

export default function NewServicePage() {
  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/configuracoes/servicos" className="text-sm text-muted hover:underline">
        ← Serviços
      </Link>
      <h1 className="text-lg font-semibold tracking-tight">Novo serviço</h1>
      <ServiceForm />
    </div>
  );
}
