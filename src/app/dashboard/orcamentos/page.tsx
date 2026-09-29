import Link from "next/link";
import { searchQuotesService } from "@/lib/quotes/service";
import { formatPlate } from "@/lib/validation/plate";
import { QuoteSearchBar } from "./QuoteSearchBar";
import { QUOTE_STATUS_CLASS, QUOTE_STATUS_LABEL } from "./statusLabels";
import type { QuoteStatus } from "@/lib/db/repositories/quotes";

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const pageSize = 20;

  const { items, total } = await searchQuotesService({
    query: params.q,
    status: (params.status as QuoteStatus) || undefined,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Orçamentos</h1>
        <Link
          href="/dashboard/orcamentos/novo"
          className="flex h-10 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground active:scale-[0.98]"
        >
          + Novo orçamento
        </Link>
      </div>

      <QuoteSearchBar />

      <p className="text-xs text-muted">
        {total} orçamento{total === 1 ? "" : "s"} encontrado{total === 1 ? "" : "s"}
      </p>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
          Nenhum orçamento encontrado com esses filtros.
        </div>
      ) : (
        <>
          {/* Celular/tablet: cartões */}
          <ul className="flex flex-col gap-3 md:hidden">
            {items.map((q) => (
              <li key={q.id}>
                <Link
                  href={`/dashboard/orcamentos/${q.id}`}
                  className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-bold">{q.number}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${QUOTE_STATUS_CLASS[q.status]}`}
                    >
                      {QUOTE_STATUS_LABEL[q.status]}
                    </span>
                  </div>
                  <span className="text-sm">{q.customerName}</span>
                  <span className="text-xs text-muted">
                    {q.vehiclePlate ? formatPlate(q.vehiclePlate) : "Sem placa"}
                    {q.vehicleLabel ? ` — ${q.vehicleLabel}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop: tabela */}
          <div className="hidden overflow-hidden rounded-2xl border border-border md:block">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Número</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Veículo</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((q) => (
                  <tr key={q.id} className="border-t border-border hover:bg-surface">
                    <td className="px-4 py-3 font-mono font-semibold">
                      <Link href={`/dashboard/orcamentos/${q.id}`} className="hover:underline">
                        {q.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{q.customerName}</td>
                    <td className="px-4 py-3 text-muted">
                      {q.vehiclePlate ? formatPlate(q.vehiclePlate) : "—"}
                      {q.vehicleLabel ? ` ${q.vehicleLabel}` : ""}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${QUOTE_STATUS_CLASS[q.status]}`}
                      >
                        {QUOTE_STATUS_LABEL[q.status]}
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
    return `/dashboard/orcamentos?${params.toString()}`;
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
