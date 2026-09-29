import Link from "next/link";
import { searchVehiclesService } from "@/lib/vehicles/service";
import { formatPlate } from "@/lib/validation/plate";
import { VehicleSearchBar } from "./VehicleSearchBar";
import type { VehicleStatus } from "@/lib/db/repositories/vehicles";

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const pageSize = 20;

  const { items, total } = await searchVehiclesService({
    query: params.q,
    status: (params.status as VehicleStatus) || "ATIVO",
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Veículos</h1>
        <Link
          href="/dashboard/veiculos/novo"
          className="flex h-10 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground active:scale-[0.98]"
        >
          + Novo veículo
        </Link>
      </div>

      <VehicleSearchBar />

      <p className="text-xs text-muted">
        {total} veículo{total === 1 ? "" : "s"} encontrado{total === 1 ? "" : "s"}
      </p>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
          Nenhum veículo encontrado com esses filtros.
        </div>
      ) : (
        <>
          {/* Celular/tablet: cartões com placa em destaque */}
          <ul className="flex flex-col gap-3 md:hidden">
            {items.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/dashboard/veiculos/${v.id}`}
                  className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-base font-bold tracking-wider">
                      {v.plate ? formatPlate(v.plate) : "Sem placa"}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        v.status === "ATIVO" ? "bg-success/15 text-success" : "bg-muted/20 text-muted"
                      }`}
                    >
                      {v.status === "ATIVO" ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                  <span className="text-sm">
                    {[v.brand, v.model].filter(Boolean).join(" ") || "Marca/modelo não informados"}
                  </span>
                  <span className="text-xs text-muted">{v.customerName}</span>
                  {v.mileage !== null ? (
                    <span className="text-xs text-muted">{v.mileage.toLocaleString("pt-BR")} km</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop: tabela */}
          <div className="hidden overflow-hidden rounded-2xl border border-border md:block">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Placa</th>
                  <th className="px-4 py-3 font-medium">Marca/Modelo</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Km</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((v) => (
                  <tr key={v.id} className="border-t border-border hover:bg-surface">
                    <td className="px-4 py-3 font-mono font-semibold tracking-wider">
                      <Link href={`/dashboard/veiculos/${v.id}`} className="hover:underline">
                        {v.plate ? formatPlate(v.plate) : "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {[v.brand, v.model].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted">{v.customerName}</td>
                    <td className="px-4 py-3 text-muted">
                      {v.mileage !== null ? v.mileage.toLocaleString("pt-BR") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          v.status === "ATIVO" ? "bg-success/15 text-success" : "bg-muted/20 text-muted"
                        }`}
                      >
                        {v.status === "ATIVO" ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <Pagination page={page} totalPages={totalPages} searchParams={params} />
          ) : null}
        </>
      )}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  searchParams,
}: {
  page: number;
  totalPages: number;
  searchParams: { q?: string; status?: string };
}) {
  function hrefFor(p: number) {
    const params = new URLSearchParams();
    if (searchParams.q) params.set("q", searchParams.q);
    if (searchParams.status) params.set("status", searchParams.status);
    params.set("page", String(p));
    return `/dashboard/veiculos?${params.toString()}`;
  }

  return (
    <div className="flex items-center justify-between text-sm">
      <Link
        href={hrefFor(Math.max(1, page - 1))}
        aria-disabled={page <= 1}
        className={`rounded-lg border border-border px-3 py-2 ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
      >
        Anterior
      </Link>
      <span className="text-muted">
        Página {page} de {totalPages}
      </span>
      <Link
        href={hrefFor(Math.min(totalPages, page + 1))}
        aria-disabled={page >= totalPages}
        className={`rounded-lg border border-border px-3 py-2 ${page >= totalPages ? "pointer-events-none opacity-40" : ""}`}
      >
        Próxima
      </Link>
    </div>
  );
}
