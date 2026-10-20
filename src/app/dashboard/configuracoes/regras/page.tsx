import Link from "next/link";
import { isDeliveryChecklistRequired, isReceptionRequiredForExecution } from "@/lib/settings/service";
import { RulesForm } from "./RulesForm";

export default async function RegrasPage() {
  const [reception, deliveryChecklist] = await Promise.all([
    isReceptionRequiredForExecution(),
    isDeliveryChecklistRequired(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/configuracoes" className="text-sm text-muted hover:underline">
        ← Configurações
      </Link>
      <h1 className="text-lg font-semibold tracking-tight">Regras da oficina</h1>
      <p className="text-sm text-muted">
        Travas do sistema que podem ser ligadas ou desligadas conforme a rotina de vocês. Desligar uma regra não
        apaga nada: o registro continua existindo, só deixa de bloquear, e o que ficou pendente aparece em
        &quot;Precisa de atenção&quot; no Início.
      </p>

      <RulesForm initial={{ reception, deliveryChecklist }} />
    </div>
  );
}
