import Link from "next/link";
import { searchWorkOrdersService } from "@/lib/workOrders/service";
import { formatPlate } from "@/lib/validation/plate";
import { WorkOrderSearchBar } from "./WorkOrderSearchBar";
import { WORK_ORDER_STATUS_CLASS, WORK_ORDER_STATUS_LABEL } from "./statusLabels";
import type { WorkOrderStatus } from "@/lib/db/repositories/workOrders";

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const pageSize = 20;

  const { items, total } = await searchWorkOrdersService({
    query: params.q,
    status: (params.status as WorkOrderStatus) || undefined,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Ordens de Serviço</h1>
        <Link
          href="/dashboard/os/novo"
          className="flex h-10 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground active:scale-[0.98]"
        >
          + Nova OS
        </Link>
      </div>

      <WorkOrderSearchBar />

      <p className="text-xs text-muted">
        {total} OS encontrada{total === 1 ? "" : "s"}
      </p>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
          Nenhuma OS encontrada com esses filtros.
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-3 md:hidden">
            {items.map((wo) => (
              <li key={wo.id}>
                <Link
                  href={`/dashboard/os/${wo.id}`}
                  className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-bold">{wo.number}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${WORK_ORDER_STATUS_CLASS[wo.status]}`}
                    >
                      {WORK_ORDER_STATUS_LABEL[wo.status]}
                    </span>
                  </div>
                  <span className="text-sm">{wo.customerName}</span>
                  <span className="text-xs text-muted">
                    {wo.vehiclePlate ? formatPlate(wo.vehiclePlate) : "Sem placa"}
                  </span>
                  {!wo.receptionAcceptedAt && wo.status !== "CANCELADA" ? (
                    <span className="mt-1 w-fit rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                      Aceite pendente
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-hidden rounded-2xl border border-border md:block">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Número</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Veículo</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Recepção</th>
                </tr>
              </thead>
              <tbody>
                {items.map((wo) => (
                  <tr key={wo.id} className="border-t border-border hover:bg-surface">
                    <td className="px-4 py-3 font-mono font-semibold">
                      <Link href={`/dashboard/os/${wo.id}`} className="hover:underline">
                        {wo.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{wo.customerName}</td>
                    <td className="px-4 py-3 text-muted">{wo.vehiclePlate ? formatPlate(wo.vehiclePlate) : "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${WORK_ORDER_STATUS_CLASS[wo.status]}`}
                      >
                        {WORK_ORDER_STATUS_LABEL[wo.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {!wo.receptionAcceptedAt && wo.status !== "CANCELADA" ? (
                        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">
                          Aceite pendente
                        </span>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
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
    return `/dashboard/os?${params.toString()}`;
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
