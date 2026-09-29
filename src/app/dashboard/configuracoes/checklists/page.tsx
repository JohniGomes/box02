import Link from "next/link";
import { searchChecklistsService } from "@/lib/checklists/checklistService";

const TYPE_LABEL: Record<string, string> = { ENTRADA: "Entrada", EXECUCAO: "Execução", ENTREGA: "Entrega" };

export default async function ChecklistsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const { items, total } = await searchChecklistsService({ query: params.q, limit: 100 });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Checklists</h1>
        <Link
          href="/dashboard/configuracoes/checklists/novo"
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
          placeholder="Buscar por código ou nome…"
          className="h-12 w-full rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </form>

      <p className="text-xs text-muted">{total} checklist{total === 1 ? "" : "s"}</p>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
          Nenhum checklist cadastrado ainda.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((checklist) => (
            <li key={checklist.id}>
              <Link
                href={`/dashboard/configuracoes/checklists/${checklist.id}`}
                className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-surface p-4"
              >
                <div>
                  <p className="text-xs font-mono text-muted">{checklist.code} · {TYPE_LABEL[checklist.type]}</p>
                  <p className="text-sm font-semibold">{checklist.name}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    checklist.status === "ATIVO" ? "bg-success/15 text-success" : "bg-muted/20 text-muted"
                  }`}
                >
                  {checklist.status === "ATIVO" ? "Ativo" : "Inativo"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
