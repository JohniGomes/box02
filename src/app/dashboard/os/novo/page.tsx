import Link from "next/link";
import { NewWorkOrderWithoutQuoteForm } from "../NewWorkOrderWithoutQuoteForm";

export default function NewWorkOrderPage() {
  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/os" className="text-sm text-muted underline-offset-2 hover:underline">
        ← Ordens de Serviço
      </Link>
      <h1 className="text-lg font-semibold tracking-tight">Nova OS (sem orçamento)</h1>
      <p className="text-sm text-muted">
        Para converter um orçamento já aprovado em OS, use o botão &quot;Converter em OS&quot; na própria
        ficha do orçamento.
      </p>
      <NewWorkOrderWithoutQuoteForm />
    </div>
  );
}
