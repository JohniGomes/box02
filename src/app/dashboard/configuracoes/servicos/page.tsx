import Link from "next/link";
import { searchServicesService } from "@/lib/services/service";
import { formatBRL } from "@/lib/money";

export default async function ServicosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const { items, total } = await searchServicesService({ query: params.q, limit: 100 });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Serviços</h1>
        <Link
          href="/dashboard/configuracoes/servicos/novo"
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
          placeholder="Buscar por nome ou categoria…"
          className="h-12 w-full rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </form>

      <p className="text-xs text-muted">
        {total} serviço{total === 1 ? "" : "s"}
      </p>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
          Nenhum serviço cadastrado ainda.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((service) => (
            <li key={service.id}>
              <Link
                href={`/dashboard/configuracoes/servicos/${service.id}`}
                className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-surface p-4"
              >
                <div>
                  <p className="text-sm font-semibold">{service.name}</p>
                  <p className="text-xs text-muted">
                    {service.category ?? "Sem categoria"}
                    {service.defaultPriceCents !== null ? ` · ${formatBRL(service.defaultPriceCents)}` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    service.status === "ATIVO" ? "bg-success/15 text-success" : "bg-muted/20 text-muted"
                  }`}
                >
                  {service.status === "ATIVO" ? "Ativo" : "Inativo"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
