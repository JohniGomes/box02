import Link from "next/link";
import { listReengagementCandidatesService } from "@/lib/crm/service";
import { formatPhone, whatsappLink } from "@/lib/validation/phone";

export default async function CrmPage() {
  const summary = await listReengagementCandidatesService();

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold tracking-tight">CRM — Lembrete de retorno</h1>
      <p className="text-sm text-muted">
        Clientes que já tiveram alguma OS entregue, mas estão há mais tempo do que o limite configurado sem
        voltar. Só uma lista — nada é enviado automaticamente.
      </p>

      {summary.thresholdDays === null ? (
        <div className="rounded-2xl border border-accent/30 bg-accent/5 p-5 text-sm">
          <p className="mb-2 text-accent">
            O limite de dias sem retorno ainda não foi configurado, então esta lista não pode ser calculada.
          </p>
          <Link href="/dashboard/configuracoes/crm" className="font-semibold text-accent hover:underline">
            Configurar limite →
          </Link>
        </div>
      ) : summary.candidates.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-5 text-center text-sm text-muted">
          Nenhum cliente passou de {summary.thresholdDays} dias sem retornar.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {summary.candidates.map((c) => (
            <li key={c.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/dashboard/clientes/${c.id}`} className="font-semibold hover:underline">
                  {c.legalName}
                </Link>
                <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-semibold text-danger">
                  {c.daysSinceLastDelivery} dias sem voltar
                </span>
              </div>
              <p className="text-xs text-muted">
                Última OS entregue em {new Date(c.lastDeliveredAt).toLocaleDateString("pt-BR")}
              </p>
              {c.phone ? (
                <a
                  href={whatsappLink(c.phone)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs font-medium text-accent"
                >
                  {formatPhone(c.phone)} — WhatsApp
                </a>
              ) : (
                <p className="mt-2 text-xs text-muted">Sem telefone cadastrado.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
