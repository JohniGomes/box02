import Link from "next/link";
import { searchCustomersService } from "@/lib/customers/service";
import { formatDocument } from "@/lib/validation/document";
import { formatPhone, whatsappLink } from "@/lib/validation/phone";
import { CustomerSearchBar } from "./CustomerSearchBar";
import type { CustomerStatus, CustomerType } from "@/lib/db/repositories/customers";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const pageSize = 20;

  const { items, total } = await searchCustomersService({
    query: params.q,
    type: (params.type as CustomerType) || undefined,
    status: (params.status as CustomerStatus) || "ATIVO",
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Clientes</h1>
        <Link
          href="/dashboard/clientes/novo"
          className="flex h-10 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground active:scale-[0.98]"
        >
          + Novo cliente
        </Link>
      </div>

      <CustomerSearchBar />

      <p className="text-xs text-muted">
        {total} cliente{total === 1 ? "" : "s"} encontrado{total === 1 ? "" : "s"}
      </p>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
          Nenhum cliente encontrado com esses filtros.
        </div>
      ) : (
        <>
          {/* Celular/tablet: lista de cartões */}
          <ul className="flex flex-col gap-3 md:hidden">
            {items.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/dashboard/clientes/${c.id}`}
                  className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{c.legalName}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        c.status === "ATIVO"
                          ? "bg-success/15 text-success"
                          : "bg-muted/20 text-muted"
                      }`}
                    >
                      {c.status === "ATIVO" ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                  <span className="text-xs text-muted">
                    {c.type === "PJ" ? "Pessoa jurídica" : "Pessoa física"}
                    {c.document ? ` · ${formatDocument(c.document)}` : ""}
                  </span>
                  {c.phone ? (
                    <span className="text-xs text-muted">{formatPhone(c.phone)}</span>
                  ) : null}
                </Link>
                {c.whatsapp ? (
                  <a
                    href={whatsappLink(c.whatsapp)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 inline-flex h-9 items-center rounded-lg border border-border px-3 text-xs font-medium text-muted"
                  >
                    Abrir WhatsApp
                  </a>
                ) : null}
              </li>
            ))}
          </ul>

          {/* Desktop: tabela */}
          <div className="hidden overflow-hidden rounded-2xl border border-border md:block">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Nome</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Documento</th>
                  <th className="px-4 py-3 font-medium">Telefone</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} className="border-t border-border hover:bg-surface">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/clientes/${c.id}`} className="font-medium hover:underline">
                        {c.legalName}
                      </Link>
                      {c.tradeName ? (
                        <span className="ml-1 text-xs text-muted">({c.tradeName})</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted">{c.type === "PJ" ? "PJ" : "PF"}</td>
                    <td className="px-4 py-3 text-muted">
                      {c.document ? formatDocument(c.document) : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted">{c.phone ? formatPhone(c.phone) : "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          c.status === "ATIVO"
                            ? "bg-success/15 text-success"
                            : "bg-muted/20 text-muted"
                        }`}
                      >
                        {c.status === "ATIVO" ? "Ativo" : "Inativo"}
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
  searchParams: { q?: string; type?: string; status?: string };
}) {
  function hrefFor(p: number) {
    const params = new URLSearchParams();
    if (searchParams.q) params.set("q", searchParams.q);
    if (searchParams.type) params.set("type", searchParams.type);
    if (searchParams.status) params.set("status", searchParams.status);
    params.set("page", String(p));
    return `/dashboard/clientes?${params.toString()}`;
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
