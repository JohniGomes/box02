import Link from "next/link";
import { listPartsWithStockService } from "@/lib/inventory/service";
import { formatBRL } from "@/lib/money";

export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const parts = await listPartsWithStockService(q);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Estoque</h1>
        <div className="flex gap-2">
        <Link
          href="/dashboard/estoque/ficha"
          className="flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium"
        >
          Ficha p/ comprar peças
        </Link>
        <Link
          href="/dashboard/estoque/compra"
          className="flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium"
        >
          Registrar compra
        </Link>
        <Link
          href="/dashboard/estoque/novo"
          className="flex h-9 items-center rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground"
        >
          + Nova peça
        </Link>
        </div>
      </div>

      <form className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por nome ou SKU…"
          className="h-11 flex-1 rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        <button type="submit" className="h-11 rounded-xl border border-border px-4 text-sm font-medium">
          Buscar
        </button>
      </form>

      {parts.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-5 text-center text-sm text-muted">
          Nenhuma peça cadastrada ainda.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {parts.map((p) => {
            const low = p.minStock !== null && p.currentStock <= p.minStock;
            return (
              <li key={p.id}>
                <Link
                  href={`/dashboard/estoque/${p.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 hover:border-accent"
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {p.name}
                      {p.status === "INATIVO" ? (
                        <span className="ml-2 rounded-full bg-muted/20 px-2 py-0.5 text-[11px] font-semibold text-muted">
                          Inativa
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted">
                      {p.sku ? `SKU ${p.sku} · ` : ""}
                      {p.costCents !== null ? `Custo ${formatBRL(p.costCents)}` : "Sem custo cadastrado"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-semibold ${low ? "text-danger" : ""}`}>
                      {p.currentStock} <span className="text-xs font-normal text-muted">{p.unit}</span>
                    </p>
                    {low ? <p className="text-[11px] font-semibold text-danger">Estoque baixo</p> : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
