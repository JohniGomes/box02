import Link from "next/link";
import { notFound } from "next/navigation";
import { getVehicleService } from "@/lib/vehicles/service";
import { getCustomerService } from "@/lib/customers/service";
import { formatPlate } from "@/lib/validation/plate";
import { VehicleStatusActions, TransferVehicleAction } from "./VehicleActions";

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const vehicle = await getVehicleService(id);
  if (!vehicle) notFound();

  const customer = await getCustomerService(vehicle.customerId);

  const yearLine = [vehicle.yearManufacture, vehicle.yearModel]
    .filter((y): y is number => Boolean(y))
    .join("/");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <Link href="/dashboard/veiculos" className="text-sm text-muted hover:underline">
          ← Veículos
        </Link>
        <Link
          href={`/dashboard/veiculos/${vehicle.id}/editar`}
          className="flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium"
        >
          Editar
        </Link>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <h1 className="font-mono text-2xl font-bold tracking-wider">
            {vehicle.plate ? formatPlate(vehicle.plate) : "Sem placa"}
          </h1>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              vehicle.status === "ATIVO" ? "bg-success/15 text-success" : "bg-muted/20 text-muted"
            }`}
          >
            {vehicle.status === "ATIVO" ? "Ativo" : "Inativo"}
          </span>
        </div>
        <p className="text-sm text-muted">
          {[vehicle.brand, vehicle.model, vehicle.version].filter(Boolean).join(" ") ||
            "Marca/modelo não informados"}
          {yearLine ? ` · ${yearLine}` : ""}
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">Cliente responsável</h2>
        {customer ? (
          <Link
            href={`/dashboard/clientes/${customer.id}`}
            className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3 hover:border-accent"
          >
            <span className="text-sm font-medium">{customer.legalName}</span>
            <span className="text-xs text-accent">Ver cliente →</span>
          </Link>
        ) : (
          <p className="text-sm text-danger">Cliente não encontrado.</p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">Dados do veículo</h2>
        <dl className="flex flex-col gap-2 text-sm">
          <Row label="Quilometragem" value={vehicle.mileage !== null ? `${vehicle.mileage.toLocaleString("pt-BR")} km` : "Não informada"} muted={vehicle.mileage === null} />
          <Row label="Cor" value={vehicle.color ?? "—"} muted={!vehicle.color} />
          <Row label="Combustível" value={vehicle.fuelType ?? "—"} muted={!vehicle.fuelType} />
          <Row label="Chassi" value={vehicle.chassis ?? "—"} muted={!vehicle.chassis} />
          <Row label="RENAVAM" value={vehicle.renavam ?? "—"} muted={!vehicle.renavam} />
        </dl>
      </section>

      {vehicle.notes ? (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold">Observações</h2>
          <p className="whitespace-pre-wrap text-sm">{vehicle.notes}</p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-dashed border-border p-5">
        <h2 className="mb-1 text-sm font-semibold">Ordens de serviço, orçamentos e histórico</h2>
        <p className="text-sm text-muted">
          Ainda não existem — chegam nos ciclos de Orçamento e OS, conforme o roadmap. Peças,
          serviços realizados e fotos também aparecerão aqui.
        </p>
      </section>

      <div className="flex flex-col gap-3">
        <TransferVehicleAction vehicleId={vehicle.id} />
        <VehicleStatusActions vehicleId={vehicle.id} status={vehicle.status} />
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={muted ? "text-muted" : "font-medium"}>{value}</dd>
    </div>
  );
}
