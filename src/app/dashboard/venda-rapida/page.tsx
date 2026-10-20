import Link from "next/link";
import { auth } from "@/auth";
import { listExecutorOptionsService } from "@/lib/executors/service";
import { QuickSaleForm } from "./QuickSaleForm";

export default async function VendaRapidaPage() {
  const [executors, session] = await Promise.all([listExecutorOptionsService(), auth()]);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard" className="text-sm text-muted hover:underline">
        ← Início
      </Link>
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Venda rápida</h1>
        <p className="mt-1 text-sm text-muted">
          Para o serviço que já foi feito e pago no balcão: cliente, carro, itens e pagamento numa tela só. O
          sistema acha o cliente pelo telefone (ou cadastra só com nome e telefone), cria o orçamento e a OS já
          entregue, lança o pagamento e abre o recibo.
        </p>
      </div>
      <QuickSaleForm executors={executors} currentUserId={session?.user?.id ?? ""} />
    </div>
  );
}
