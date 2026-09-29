import { resolveAdditionalItemAccessTokenService } from "@/lib/workOrders/service";
import { formatBRL } from "@/lib/money";
import { AdditionalItemDecisionForm } from "./AdditionalItemDecisionForm";

const ITEM_TYPE_LABEL: Record<string, string> = {
  SERVICO: "Serviço",
  PECA: "Peça",
  MAO_DE_OBRA: "Mão de obra",
};

const DECISION_LABEL: Record<string, string> = {
  APROVADO: "Aprovado",
  RECUSADO: "Recusado",
};

export default async function AdditionalItemPublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolution = await resolveAdditionalItemAccessTokenService(token);

  return (
    <main className="flex min-h-screen flex-col bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div aria-hidden className="flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground">
            {/* eslint-disable-next-line @next/next/no-img-element -- emblema oficial (PNG de referência), não um ícone do design system */}
            <img src="/box02-mark.png" alt="" className="h-9 w-9 object-contain" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">BOX 02</h1>
          <p className="text-sm text-muted">Serviço adicional identificado durante o atendimento</p>
        </div>

        {resolution.kind === "not_found" || resolution.kind === "revoked" ? (
          <MessageCard
            title="Link não é mais válido"
            description="Entre em contato com a oficina para receber o link atualizado."
          />
        ) : null}

        {resolution.kind === "expired" ? (
          <MessageCard
            title="Este link expirou"
            description="A validade era de 48 horas. Entre em contato com a oficina."
          />
        ) : null}

        {resolution.kind === "pending" ? (
          <AdditionalItemDecisionForm
            token={token}
            item={{
              type: resolution.item.type,
              description: resolution.item.description,
              totalCents: resolution.item.totalCents,
            }}
          />
        ) : null}

        {resolution.kind === "decided" ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-xs font-medium text-muted">{ITEM_TYPE_LABEL[resolution.item.type]}</p>
              <p className="mt-1 text-sm">{resolution.item.description}</p>
              <p className="mt-2 text-lg font-semibold">{formatBRL(resolution.item.totalCents)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4 text-center">
              <p className="text-sm font-semibold">
                {DECISION_LABEL[resolution.item.clientDecision] ?? resolution.item.clientDecision} por{" "}
                {resolution.item.clientAuthorizedBy}
              </p>
              {resolution.item.clientAuthorizedAt ? (
                <p className="text-xs text-muted">
                  {new Date(resolution.item.clientAuthorizedAt).toLocaleString("pt-BR")}
                </p>
              ) : null}
            </div>
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
