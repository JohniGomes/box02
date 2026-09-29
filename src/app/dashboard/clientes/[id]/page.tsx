import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomerService } from "@/lib/customers/service";
import { listVehiclesByCustomerService } from "@/lib/vehicles/service";
import { formatDocument } from "@/lib/validation/document";
import { formatPhone, whatsappLink } from "@/lib/validation/phone";
import { formatPlate } from "@/lib/validation/plate";
import { CustomerStatusActions } from "./CustomerStatusActions";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await getCustomerService(id);
  if (!customer) notFound();

  const vehicles = await listVehiclesByCustomerService(id);

  const address = [
    customer.addressStreet,
    customer.addressNumber,
    customer.addressComplement,
  ]
    .filter(Boolean)
    .join(", ");
  const cityLine = [customer.addressNeighborhood, customer.addressCity, customer.addressState]
    .filter(Boolean)
    .join(" — ");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <Link href="/dashboard/clientes" className="text-sm text-muted hover:underline">
          ← Clientes
        </Link>
        <Link
          href={`/dashboard/clientes/${customer.id}/editar`}
          className="flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium"
        >
          Editar
        </Link>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">{customer.legalName}</h1>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              customer.status === "ATIVO" ? "bg-success/15 text-success" : "bg-muted/20 text-muted"
            }`}
          >
            {customer.status === "ATIVO" ? "Ativo" : "Inativo"}
          </span>
        </div>
        <p className="text-sm text-muted">
          {customer.type === "PJ" ? "Pessoa jurídica" : "Pessoa física"}
          {customer.tradeName ? ` · ${customer.tradeName}` : ""}
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">Identificação</h2>
        <dl className="flex flex-col gap-2 text-sm">
          {customer.document ? (
            <Row label={customer.type === "PJ" ? "CNPJ" : "CPF"} value={formatDocument(customer.document)} />
          ) : (
            <Row label={customer.type === "PJ" ? "CNPJ" : "CPF"} value="Não informado" muted />
          )}
          {customer.contactName ? <Row label="Responsável" value={customer.contactName} /> : null}
        </dl>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">Contato</h2>
        <dl className="flex flex-col gap-2 text-sm">
          {customer.phone ? (
            <Row
              label="Telefone"
              value={
                <a href={`tel:${customer.phone}`} className="text-accent hover:underline">
                  {formatPhone(customer.phone)}
                </a>
              }
            />
          ) : null}
          {customer.whatsapp ? (
            <Row
              label="WhatsApp"
              value={
                <a
                  href={whatsappLink(customer.whatsapp)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  {formatPhone(customer.whatsapp)}
                </a>
              }
            />
          ) : null}
          {customer.email ? (
            <Row
              label="E-mail"
              value={
                <a href={`mailto:${customer.email}`} className="text-accent hover:underline">
                  {customer.email}
                </a>
              }
            />
          ) : null}
          {!customer.phone && !customer.whatsapp && !customer.email ? (
            <p className="text-sm text-muted">Nenhum contato informado.</p>
          ) : null}
        </dl>
      </section>

      {address || cityLine || customer.addressZipCode ? (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold">Endereço</h2>
          <p className="text-sm">{address || "—"}</p>
          <p className="text-sm text-muted">{cityLine}</p>
          {customer.addressZipCode ? (
            <p className="text-sm text-muted">CEP {customer.addressZipCode}</p>
          ) : null}
        </section>
      ) : null}

      {customer.notes ? (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold">Observações</h2>
          <p className="whitespace-pre-wrap text-sm">{customer.notes}</p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-border p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Veículos</h2>
          <Link
            href={`/dashboard/veiculos/novo?customerId=${customer.id}`}
            className="text-xs font-medium text-accent"
          >
            + Adicionar
          </Link>
        </div>
        {vehicles.length === 0 ? (
          <p className="text-sm text-muted">Nenhum veículo cadastrado ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {vehicles.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/dashboard/veiculos/${v.id}`}
                  className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3 hover:border-accent"
                >
                  <div className="flex flex-col">
                    <span className="font-mono text-sm font-semibold tracking-wider">
                      {v.plate ? formatPlate(v.plate) : "Sem placa"}
                    </span>
                    <span className="text-xs text-muted">
                      {[v.brand, v.model].filter(Boolean).join(" ") || "Marca/modelo não informados"}
                    </span>
                  </div>
                  {v.status === "INATIVO" ? (
                    <span className="rounded-full bg-muted/20 px-2 py-0.5 text-[11px] font-semibold text-muted">
                      Inativo
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-dashed border-border p-5">
        <h2 className="mb-1 text-sm font-semibold">Ordens de serviço e orçamentos</h2>
        <p className="text-sm text-muted">
          Ainda não existem — chegam nos ciclos de OS e Orçamento, conforme o roadmap.
        </p>
      </section>

      <CustomerStatusActions customerId={customer.id} status={customer.status} />
    </div>
  );
}

function Row({
  label,
  value,
  muted,
}: {
  label: string;
  value: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={muted ? "text-muted" : "font-medium"}>{value}</dd>
    </div>
  );
}
