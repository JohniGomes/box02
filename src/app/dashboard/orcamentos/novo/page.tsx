import Link from "next/link";
import { QuoteForm } from "../QuoteForm";

export default function NewQuotePage() {
  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/orcamentos" className="text-sm text-muted underline-offset-2 hover:underline">
        ← Orçamentos
      </Link>
      <h1 className="text-lg font-semibold tracking-tight">Novo orçamento</h1>
      <QuoteForm mode="create" />
    </div>
  );
}
