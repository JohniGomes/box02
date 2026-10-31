import type { Metadata } from "next";
import { getPublicVehicleViewService } from "@/lib/vehicles/qrPublic";
import { getShopWhatsapp } from "@/lib/settings/service";
import { whatsappLinkWithMessage } from "@/lib/validation/phone";
import { formatPlate } from "@/lib/validation/plate";

// Página pública do QR Car: não deve aparecer em buscadores.
export const metadata: Metadata = { title: "Seu carro na BOX 02", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const DUE_LABEL = { VENCIDA: "Vencida", PROXIMA: "Chegando", EM_DIA: "Em dia" } as const;
const DUE_CLASS = {
  VENCIDA: "bg-danger/15 text-danger",
  PROXIMA: "bg-accent/15 text-foreground",
  EM_DIA: "bg-success/15 text-success",
} as const;

function dateBr(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export default async function PublicVehiclePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [view, shopPhone] = await Promise.all([getPublicVehicleViewService(token), getShopWhatsapp()]);

  return (
    <main className="flex min-h-screen flex-col bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div aria-hidden className="flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground">
            {/* eslint-disable-next-line @next/next/no-img-element -- emblema oficial (PNG de referência), não um ícone do design system */}
            <img src="/box02-mark.png" alt="" className="h-9 w-9 object-contain" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">BOX 02</h1>
          <p className="text-xs text-muted">Centro Automotivo · Anápolis/GO</p>
        </div>

        {!view ? (
          <section className="rounded-2xl border border-border bg-surface p-5 text-center">
            <h2 className="mb-1 text-base font-semibold">Este QR não está mais ativo</h2>
            <p className="text-sm text-muted">Fale com a oficina para receber um QR atualizado do seu carro.</p>
          </section>
        ) : (
          <VehicleView view={view} shopPhone={shopPhone} />
        )}
      </div>
    </main>
  );
}

function VehicleView({
  view,
  shopPhone,
}: {
  view: NonNullable<Awaited<ReturnType<typeof getPublicVehicleViewService>>>;
  shopPhone: string | null;
}) {
  const { vehicle, history, due } = view;
  const name = [vehicle.brand, vehicle.model, vehicle.version].filter(Boolean).join(" ") || "Seu veículo";
  const year = [vehicle.yearManufacture, vehicle.yearModel].filter((y): y is number => Boolean(y)).join("/");
  const plate = vehicle.plate ? formatPlate(vehicle.plate) : null;
  const carText = `${[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "meu carro"}${plate ? ` (placa ${plate})` : ""}`;

  const remindMessage = `Olá! Quero receber lembretes de manutenção do ${carText}.`;
  const scheduleMessage = `Olá! Quero agendar um horário para o ${carText}.`;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">{name}</h2>
        <p className="text-sm text-muted">
          {[year, vehicle.color].filter(Boolean).join(" · ")}
          {plate ? `${year || vehicle.color ? " · " : ""}${plate}` : ""}
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-1 text-sm font-semibold">Próximas trocas e revisões</h2>
        {due.length === 0 ? (
          <p className="text-sm text-muted">Ainda não há lembretes calculados para este carro.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {due.map((d) => (
              <li key={d.serviceId} className="flex items-start justify-between gap-2 text-sm">
                <span>
                  <span className="font-medium">{d.serviceName}</span>
                  <span className="block text-xs text-muted">
                    Última em {dateBr(d.lastAt)}
                    {d.lastKm != null ? ` · ${d.lastKm.toLocaleString("pt-BR")} km` : ""}
                    {d.dueText ? ` · próxima: ${d.dueText}` : ""}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${DUE_CLASS[d.status]}`}>
                  {DUE_LABEL[d.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-1 text-sm font-semibold">O que já fizemos no seu carro</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted">Nenhum serviço registrado ainda.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {history.map((h, i) => (
              <li key={i} className="text-sm">
                <p className="font-medium">
                  {dateBr(h.deliveredAt)}
                  {h.mileageAtEntry != null ? ` · ${h.mileageAtEntry.toLocaleString("pt-BR")} km` : ""}
                </p>
                {h.items.length > 0 ? <p className="text-xs text-muted">{h.items.join(" · ")}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {shopPhone ? (
        <div className="flex flex-col gap-2">
          <a
            href={whatsappLinkWithMessage(shopPhone, remindMessage)}
            className="flex h-12 items-center justify-center rounded-xl bg-accent text-sm font-semibold text-accent-foreground"
          >
            Quero receber lembretes
          </a>
          <a
            href={whatsappLinkWithMessage(shopPhone, scheduleMessage)}
            className="flex h-12 items-center justify-center rounded-xl border border-border text-sm font-semibold"
          >
            Agendar um horário
          </a>
          <p className="text-center text-xs text-muted">Os botões abrem uma conversa de WhatsApp com a BOX 02.</p>
        </div>
      ) : (
        <p className="text-center text-xs text-muted">Para receber lembretes ou agendar, fale com a BOX 02.</p>
      )}
    </div>
  );
}
