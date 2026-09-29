import Link from "next/link";
import { searchProceduresService } from "@/lib/checklists/procedureService";

export default async function ProcedimentosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const { items, total } = await searchProceduresService({ query: params.q, limit: 100 });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Procedimentos</h1>
        <Link
          href="/dashboard/configuracoes/procedimentos/novo"
          className="flex h-10 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground active:scale-[0.98]"
        >
          + Novo
        </Link>
      </div>

      <form className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Buscar por código ou título…"
          className="h-12 w-full rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </form>

      <p className="text-xs text-muted">{total} procedimento{total === 1 ? "" : "s"}</p>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
          Nenhum procedimento cadastrado ainda.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((procedure) => (
            <li key={procedure.id}>
              <Link
                href={`/dashboard/configuracoes/procedimentos/${procedure.id}`}
                className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-surface p-4"
              >
                <div>
                  <p className="text-xs font-mono text-muted">{procedure.code}</p>
                  <p className="text-sm font-semibold">{procedure.title}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    procedure.status === "ATIVO" ? "bg-success/15 text-success" : "bg-muted/20 text-muted"
                  }`}
                >
                  {procedure.status === "ATIVO" ? "Ativo" : "Inativo"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
