import Link from "next/link";
import { ProcedureForm } from "../ProcedureForm";

export default function NewProcedurePage() {
  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/configuracoes/procedimentos" className="text-sm text-muted hover:underline">
        ← Procedimentos
      </Link>
      <h1 className="text-lg font-semibold tracking-tight">Novo procedimento</h1>
      <ProcedureForm />
    </div>
  );
}
