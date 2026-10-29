import Link from "next/link";
import { findVehicleByPlate } from "@/lib/db/repositories/vehicles";
import { formatPlate, normalizePlate } from "@/lib/validation/plate";
import { VehicleSheet } from "./VehicleSheet";

export default async function PartsSheetPage({ searchParams }: { searchParams: Promise<{ placa?: string }> }) {
  const { placa } = await searchParams;
  const plate = placa ? normalizePlate(placa) : "";
  const vehicle = plate ? await findVehicleByPlate(plate) : null;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/estoque" className="text-sm text-muted underline-offset-2 hover:underline">
        ← Estoque
      </Link>
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Ficha do veículo para comprar peças</h1>
        <p className="text-sm text-muted">
          Digite a placa: se o carro já passou pela oficina, marca, modelo e ano aparecem na hora. Depois é só copiar a ficha
          para o fornecedor.
        </p>
      </div>

      <form method="get" className="flex gap-2">
        <input
          name="placa"
          defaultValue={placa ?? ""}
          placeholder="Placa (ex.: ABC1D23)"
          className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 text-base uppercase outline-none focus:border-accent"
        />
        <button type="submit" className="h-12 rounded-xl bg-accent px-5 text-sm font-semibold text-accent-foreground">
          Consultar
        </button>
      </form>

      {plate && vehicle ? (
        <p className="rounded-xl border border-success/30 bg-success/5 p-3 text-sm">
          Veículo encontrado no cadastro: <strong>{formatPlate(plate)}</strong>. Confira os dados abaixo; o que faltar você pode
          completar e salvar no cadastro.
        </p>
      ) : plate ? (
        <p className="rounded-xl border border-border bg-surface p-3 text-sm">
          Não achei a placa <strong>{formatPlate(plate)}</strong> no cadastro. Preencha abaixo para montar a ficha (ela só é
          salva se o veículo estiver cadastrado, em <Link href="/dashboard/veiculos" className="font-medium text-accent">Veículos</Link>).
        </p>
      ) : null}

      <VehicleSheet
        key={`${plate}-${vehicle?.id ?? "novo"}`}
        vehicleId={vehicle?.id ?? null}
        initial={{
          brand: vehicle?.brand ?? "",
          model: vehicle?.model ?? "",
          version: vehicle?.version ?? "",
          yearManufacture: vehicle?.yearManufacture ? String(vehicle.yearManufacture) : "",
          yearModel: vehicle?.yearModel ? String(vehicle.yearModel) : "",
          plate: plate ? formatPlate(plate) : "",
          chassis: vehicle?.chassis ?? "",
        }}
      />
    </div>
  );
}
