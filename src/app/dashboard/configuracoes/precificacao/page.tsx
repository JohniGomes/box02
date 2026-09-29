import Link from "next/link";
import { getDefaultMarkupPercent } from "@/lib/settings/service";
import { MarkupForm } from "./MarkupForm";

export default async function PrecificacaoPage() {
  const markupPercent = await getDefaultMarkupPercent();

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/configuracoes" className="text-sm text-muted hover:underline">
        ← Configurações
      </Link>
      <h1 className="text-lg font-semibold tracking-tight">Precificação</h1>

      <div className="rounded-2xl border border-border bg-surface p-5">
        {markupPercent === null ? (
          <p className="mb-3 rounded-xl bg-accent/10 px-3 py-2 text-sm text-accent">
            Markup padrão ainda não configurado. Serviços sem preço manual e com custo cadastrado não terão
            preço sugerido calculado até que o markup seja definido aqui.
          </p>
        ) : (
          <p className="mb-3 text-sm text-muted">Markup padrão atual: {markupPercent}%</p>
        )}
        <MarkupForm initialPercent={markupPercent} />
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted">
        <p className="mb-2 font-semibold text-foreground">Como funciona</p>
        <p>
          Custo, markup e preço calculado são informações internas — nunca aparecem para o cliente em nenhum
          orçamento, OS, Termo de Recepção ou Entrega Técnica. O preço praticado (o que de fato entra no
          orçamento/OS) continua sempre editável livremente, independente do que o sistema sugerir.
        </p>
      </div>
    </div>
  );
}
