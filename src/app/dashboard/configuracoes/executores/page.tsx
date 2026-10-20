import Link from "next/link";
import { listAllExecutorsService } from "@/lib/executors/service";
import { ExecutorsClient } from "./ExecutorsClient";

export default async function ExecutoresPage() {
  const executors = await listAllExecutorsService();

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/configuracoes" className="text-sm text-muted hover:underline">
        ← Configurações
      </Link>
      <h1 className="text-lg font-semibold tracking-tight">Executores</h1>
      <p className="text-sm text-muted">
        Lista simples de quem executa os serviços. Aparece em &quot;Executado por&quot; ao marcar um item da OS como
        executado. Não precisa de login. Inativar um nome o tira das opções, mas não muda os itens já executados.
      </p>
      <ExecutorsClient
        executors={executors.map((e) => ({ id: e.id, name: e.name, status: e.status }))}
      />
    </div>
  );
}
