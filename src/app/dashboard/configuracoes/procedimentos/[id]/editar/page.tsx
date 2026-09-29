import Link from "next/link";
import { notFound } from "next/navigation";
import { getProcedureService } from "@/lib/checklists/procedureService";
import { ProcedureForm } from "../../ProcedureForm";

export default async function EditProcedurePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const procedure = await getProcedureService(id);
  if (!procedure) notFound();

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/dashboard/configuracoes/procedimentos/${id}`} className="text-sm text-muted hover:underline">
        ← {procedure.code}
      </Link>
      <h1 className="text-lg font-semibold tracking-tight">Editar procedimento</h1>
      <ProcedureForm
        procedureId={procedure.id}
        initial={{
          code: procedure.code,
          title: procedure.title,
          objective: procedure.objective ?? "",
          prerequisites: procedure.prerequisites ?? "",
          steps: procedure.steps ?? "",
          completionCriteria: procedure.completionCriteria ?? "",
        }}
      />
    </div>
  );
}
