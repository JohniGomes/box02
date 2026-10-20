import Link from "next/link";
import { listServiceRequestsService } from "@/lib/serviceRequests/service";
import { formatPhone, whatsappLinkWithMessage } from "@/lib/validation/phone";
import { RequestActions } from "./RequestActions";
import type { ServiceRequestStatus } from "@/lib/db/repositories/serviceRequests";

const STATUS_LABEL: Record<ServiceRequestStatus, string> = {
  PENDENTE: "Pendente",
  ATENDIDA: "Atendida",
  DESCARTADA: "Descartada",
};

const STATUS_BADGE: Record<ServiceRequestStatus, string> = {
  PENDENTE: "bg-accent/15 text-foreground",
  ATENDIDA: "bg-success/15 text-success",
  DESCARTADA: "bg-muted/20 text-muted",
};

/** Mensagem pronta para responder o cliente: quem abre só confere e envia. */
function buildReplyMessage(r: { customerName: string; vehicleDescription: string | null; description: string }): string {
  const firstName = r.customerName.trim().split(/\s+/)[0];
  const vehicle = r.vehicleDescription ? ` para o ${r.vehicleDescription}` : "";
  return (
    `Olá, ${firstName}! Aqui é da BOX 02. Recebemos seu pedido${vehicle}: "${r.description}". ` +
    `Qual dia e horário ficam bons para você trazer o veículo?`
  );
}

export default async function ServiceRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const status = (params.status as ServiceRequestStatus) || "PENDENTE";
  const requests = await listServiceRequestsService(status);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Solicitações</h1>
      </div>

      <p className="text-xs text-muted">
        Pedidos enviados pelos clientes pelo formulário público (
        <span className="font-mono">/solicitar</span>).
      </p>

      <div className="flex gap-2">
        {(["PENDENTE", "ATENDIDA", "DESCARTADA"] as const).map((s) => (
          <Link
            key={s}
            href={`/dashboard/solicitacoes?status=${s}`}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              status === s ? "bg-accent text-accent-foreground" : "bg-surface text-muted"
            }`}
          >
            {STATUS_LABEL[s]}
          </Link>
        ))}
      </div>

      {requests.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
          Nenhuma solicitação {STATUS_LABEL[status].toLowerCase()}.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{r.customerName}</p>
                  <p className="text-xs text-muted">{formatPhone(r.customerPhone)}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[r.status]}`}>
                  {STATUS_LABEL[r.status]}
                </span>
              </div>

              {r.vehicleDescription ? (
                <p className="text-sm text-muted">Veículo: {r.vehicleDescription}</p>
              ) : null}

              <p className="whitespace-pre-wrap rounded-xl bg-background p-3 text-sm">{r.description}</p>

              <p className="text-xs text-muted">{new Date(r.createdAt).toLocaleString("pt-BR")}</p>

              <a
                href={whatsappLinkWithMessage(r.customerPhone, buildReplyMessage(r))}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 w-fit items-center rounded-lg border border-border px-3 text-xs font-medium text-muted"
              >
                Falar com o cliente no WhatsApp
              </a>

              {r.status === "PENDENTE" ? <RequestActions serviceRequestId={r.id} /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
