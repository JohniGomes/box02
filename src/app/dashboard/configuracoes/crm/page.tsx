import Link from "next/link";
import { getReengagementThresholdService } from "@/lib/crm/service";
import { ReengagementThresholdForm } from "./ReengagementThresholdForm";

export default async function CrmConfigPage() {
  const thresholdDays = await getReengagementThresholdService();

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/configuracoes" className="text-sm text-muted hover:underline">
        ← Configurações
      </Link>
      <h1 className="text-lg font-semibold tracking-tight">CRM</h1>

      <div className="rounded-2xl border border-border bg-surface p-5">
        {thresholdDays === null ? (
          <p className="mb-3 rounded-xl bg-accent/10 px-3 py-2 text-sm text-accent">
            Limite de dias ainda não configurado. A lista de lembrete de retorno não calcula nada até que este
            valor seja definido aqui.
          </p>
        ) : (
          <p className="mb-3 text-sm text-muted">
            Limite atual: clientes sem OS entregue há mais de {thresholdDays} dias entram na lista de lembrete.
          </p>
        )}
        <ReengagementThresholdForm initialDays={thresholdDays} />
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted">
        <p className="mb-2 font-semibold text-foreground">Como funciona</p>
        <p>
          O critério é tempo desde a última OS entregue (não quilometragem — o odômetro não é atualizado de
          forma confiável fora da abertura de uma OS). O sistema só lista quem já teve pelo menos uma OS
          entregue; não dispara nenhuma mensagem automaticamente, apenas mostra a lista para vocês decidirem o
          que fazer.
        </p>
      </div>
    </div>
  );
}
