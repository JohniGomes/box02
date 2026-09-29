import Link from "next/link";
import { notFound } from "next/navigation";
import { getProcedureService } from "@/lib/checklists/procedureService";
import { ProcedureStatusToggle } from "./ProcedureStatusToggle";

export default async function ProcedureDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const procedure = await getProcedureService(id);
  if (!procedure) notFound();

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/configuracoes/procedimentos" className="text-sm text-muted hover:underline">
        ← Procedimentos
      </Link>

      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold tracking-tight">{procedure.code} — {procedure.title}</h1>
      </div>
      <span
        className={`w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          procedure.status === "ATIVO" ? "bg-success/15 text-success" : "bg-muted/20 text-muted"
        }`}
      >
        {procedure.status === "ATIVO" ? "Ativo" : "Inativo"}
      </span>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <dl className="flex flex-col gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted">Objetivo</dt>
            <dd className="whitespace-pre-wrap">{procedure.objective ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Pré-requisitos</dt>
            <dd className="whitespace-pre-wrap">{procedure.prerequisites ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Passos</dt>
            <dd className="whitespace-pre-wrap">{procedure.steps ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Critério de conclusão</dt>
            <dd className="whitespace-pre-wrap">{procedure.completionCriteria ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <div className="flex flex-col gap-3">
        <Link
          href={`/dashboard/configuracoes/procedimentos/${procedure.id}/editar`}
          className="flex h-12 items-center justify-center rounded-xl border border-border text-base font-semibold"
        >
          Editar
        </Link>
        <ProcedureStatusToggle procedureId={procedure.id} status={procedure.status} />
      </div>
    </div>
  );
}
