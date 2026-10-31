import Link from "next/link";
import { notFound } from "next/navigation";
import { getVehicleService } from "@/lib/vehicles/service";
import { getVehicleQrTokenService } from "@/lib/vehicles/qr";
import { publicOrigin, qrSvg, vehiclePublicUrl } from "@/lib/vehicles/qrSvg";
import { formatPlate } from "@/lib/validation/plate";
import { PrintButton } from "@/components/PrintButton";

/** Etiqueta para colar no carro ou entregar ao cliente: QR grande, placa e instrução. */
export default async function VehicleLabelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vehicle = await getVehicleService(id);
  if (!vehicle) notFound();

  const token = await getVehicleQrTokenService(vehicle.id);
  const markup = token ? await qrSvg(vehiclePublicUrl(await publicOrigin(), token)) : null;
  const name = [vehicle.brand, vehicle.model].filter(Boolean).join(" ");

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 print:gap-2">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href={`/dashboard/veiculos/${vehicle.id}`} className="text-sm text-muted hover:underline">
          ← Voltar para o veículo
        </Link>
        {markup ? <PrintButton label="Imprimir etiqueta" /> : null}
      </div>

      {!markup ? (
        <div className="rounded-2xl border border-border bg-surface p-5 text-sm">
          Este veículo ainda não tem QR. Volte para o veículo e toque em &quot;Gerar QR Car&quot;.
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-black bg-white p-5 text-center text-black">
          <p className="text-sm font-bold uppercase tracking-widest">BOX 02</p>
          <p className="text-xs">Centro Automotivo · Anápolis/GO</p>
          <div className="w-56 [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: markup }} />
          <p className="text-sm font-semibold">Histórico e lembretes do seu carro</p>
          <p className="text-xs">Aponte a câmera do celular para o QR.</p>
          <p className="font-mono text-base font-bold tracking-wider">{vehicle.plate ? formatPlate(vehicle.plate) : ""}</p>
          {name ? <p className="text-xs">{name}</p> : null}
        </div>
      )}
    </div>
  );
}
