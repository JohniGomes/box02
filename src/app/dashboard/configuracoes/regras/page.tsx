import Link from "next/link";
import { isReceptionRequiredForExecution } from "@/lib/settings/service";
import { RulesForm } from "./RulesForm";

export default async function RegrasPage() {
  const receptionRequired = await isReceptionRequiredForExecution();

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/configuracoes" className="text-sm text-muted hover:underline">
        ← Configurações
      </Link>
      <h1 className="text-lg font-semibold tracking-tight">Regras da oficina</h1>
      <p className="text-sm text-muted">
        Travas do sistema que podem ser ligadas ou desligadas conforme a rotina de vocês. Desligar uma regra não
        apaga nada: o registro continua existindo, só deixa de bloquear.
      </p>

      <RulesForm receptionRequired={receptionRequired} />
    </div>
  );
}
