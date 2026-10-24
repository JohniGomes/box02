import Link from "next/link";
import { formatDateTimeBR } from "@/lib/dateBr";

/** Resumo compacto na ficha da OS — o Termo de Recepção (avarias,
 * ciência do cliente, aceite) agora é preenchido na própria tela
 * dedicada, igual ao PDF em papel, não mais inline aqui. */
export function WorkOrderReceptionSection({
  workOrderId,
  receptionAcceptedAt,
  receptionAcceptedName,
}: {
  workOrderId: string;
  receptionAcceptedAt: string | null;
  receptionAcceptedName: string | null;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Recepção</h2>
        <Link
          href={`/dashboard/os/${workOrderId}/termo-recepcao`}
          className="text-xs font-medium text-accent"
        >
          Abrir Termo de Recepção →
        </Link>
      </div>

      {receptionAcceptedAt ? (
        <div className="mt-2 rounded-xl border border-success/30 bg-success/5 p-3">
          <p className="text-sm font-medium text-success">Aceite de recepção registrado</p>
          <p className="text-xs text-muted">
            Por {receptionAcceptedName} em {formatDateTimeBR(receptionAcceptedAt)}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">
          Aceite ainda não registrado — preencha avarias e colete a ciência do cliente no Termo de Recepção.
        </p>
      )}
    </section>
  );
}
