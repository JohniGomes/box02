import { resolveQuoteAccessTokenService } from "@/lib/quotes/service";
import { formatBRL } from "@/lib/money";
import { formatPlate } from "@/lib/validation/plate";
import { QuoteApprovalForm } from "./QuoteApprovalForm";
import { QuoteFinancialSummary } from "./QuoteFinancialSummary";

const ITEM_TYPE_LABEL: Record<string, string> = {
  SERVICO: "Serviço",
  PECA: "Peça",
  MAO_DE_OBRA: "Mão de obra",
};

const DECISION_LABEL: Record<string, string> = {
  PENDENTE: "Pendente",
  APROVADO: "Aprovado",
  RECUSADO: "Recusado",
};

export default async function PublicQuotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolution = await resolveQuoteAccessTokenService(token);

  return (
    <main className="flex min-h-screen flex-col bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div
            aria-hidden
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- emblema oficial (PNG de referência), não um ícone do design system */}
            <img src="/box02-mark.png" alt="" className="h-9 w-9 object-contain" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">BOX 02</h1>
        </div>

        {resolution.kind === "not_found" || resolution.kind === "revoked" ? (
          <MessageCard
            title="Link não é mais válido"
            description="Entre em contato com a oficina para receber o link atualizado."
          />
        ) : null}

        {resolution.kind === "expired" ? (
          <MessageCard
            title="Este orçamento expirou"
            description={`A validade encerrou em ${resolution.validUntil.toLocaleDateString("pt-BR")}. Entre em contato com a oficina.`}
          />
        ) : null}

        {resolution.kind === "cancelled" ? (
          <MessageCard
            title="Orçamento cancelado"
            description="Este orçamento foi cancelado pela oficina. Entre em contato se tiver dúvidas."
          />
        ) : null}

        {resolution.kind === "pending" ? (
          <div className="flex flex-col gap-5">
            <QuoteSummary
              number={resolution.context.quote.number}
              vehicle={resolution.context.vehicle}
              customerMessage={resolution.context.version.customerMessage}
              validUntil={resolution.context.version.validUntil}
            />
            <QuoteFinancialSummary
              subtotalServicesCents={resolution.context.version.subtotalServicesCents}
              subtotalPartsCents={resolution.context.version.subtotalPartsCents}
              subtotalLaborCents={resolution.context.version.subtotalLaborCents}
              discountTotalCents={resolution.context.version.discountTotalCents}
              surchargeTotalCents={resolution.context.version.surchargeTotalCents}
              totalCents={resolution.context.version.totalCents}
              informativeEstimatedCents={resolution.context.items
                .filter((i) => i.category === "INFORMATIVO")
                .reduce((sum, i) => sum + i.totalCents, 0)}
            />
            <QuoteApprovalForm
              token={token}
              items={resolution.context.items.map((i) => ({
                id: i.id,
                type: i.type,
                description: i.description,
                totalCents: i.totalCents,
                category: i.category,
              }))}
            />
          </div>
        ) : null}

        {resolution.kind === "decided" ? (
          <div className="flex flex-col gap-5">
            <QuoteSummary
              number={resolution.context.quote.number}
              vehicle={resolution.context.vehicle}
              customerMessage={resolution.context.version.customerMessage}
              validUntil={resolution.context.version.validUntil}
            />
            <QuoteFinancialSummary
              subtotalServicesCents={resolution.context.version.subtotalServicesCents}
              subtotalPartsCents={resolution.context.version.subtotalPartsCents}
              subtotalLaborCents={resolution.context.version.subtotalLaborCents}
              discountTotalCents={resolution.context.version.discountTotalCents}
              surchargeTotalCents={resolution.context.version.surchargeTotalCents}
              totalCents={resolution.context.version.totalCents}
              informativeEstimatedCents={resolution.context.items
                .filter((i) => i.category === "INFORMATIVO")
                .reduce((sum, i) => sum + i.totalCents, 0)}
            />

            {resolution.approval.decision === "APROVADO_PARCIAL" ? (
              <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4">
                <div className="flex justify-between text-base font-semibold">
                  <span>Total aprovado</span>
                  <span>
                    {formatBRL(
                      resolution.context.items
                        .filter((i) => i.clientDecision === "APROVADO")
                        .reduce((sum, i) => sum + i.totalCents, 0),
                    )}
                  </span>
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-border bg-surface p-4 text-center">
              <p className="text-sm font-semibold">
                Decisão já registrada por {resolution.approval.approverName}
              </p>
              <p className="text-xs text-muted">
                {new Date(resolution.approval.decidedAt).toLocaleString("pt-BR")}
              </p>
            </div>

            <ul className="flex flex-col gap-2">
              {resolution.context.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-surface p-3 text-sm"
                >
                  <div>
                    <p className="text-xs text-muted">{ITEM_TYPE_LABEL[item.type]}</p>
                    <p>{item.description}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatBRL(item.totalCents)}</p>
                    <p
                      className={`text-xs font-medium ${
                        item.clientDecision === "APROVADO"
                          ? "text-success"
                          : item.clientDecision === "RECUSADO"
                            ? "text-danger"
                            : "text-muted"
                      }`}
                    >
                      {DECISION_LABEL[item.clientDecision]}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function MessageCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6 text-center">
      <p className="text-base font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted">{description}</p>
    </div>
  );
}

function QuoteSummary({
  number,
  vehicle,
  customerMessage,
  validUntil,
}: {
  number: string;
  vehicle: { plate: string | null; brand: string | null; model: string | null };
  customerMessage: string | null;
  validUntil: Date;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm font-bold">{number}</span>
        <span className="text-xs text-muted">
          Válido até {new Date(validUntil).toLocaleDateString("pt-BR")}
        </span>
      </div>
      <p className="mt-1 text-sm">
        {vehicle.plate ? formatPlate(vehicle.plate) : "Sem placa"}
        {" — "}
        {[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "Veículo"}
      </p>
      {customerMessage ? (
        <p className="mt-3 whitespace-pre-wrap rounded-xl bg-background p-3 text-sm">{customerMessage}</p>
      ) : null}
    </div>
  );
}
