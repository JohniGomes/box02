import Link from "next/link";
import { notFound } from "next/navigation";
import { getQuoteSyncPreviewService } from "@/lib/workOrders/quoteSyncService";
import { getWorkOrderService } from "@/lib/workOrders/service";
import { QuoteSyncForm } from "./QuoteSyncForm";

/** Atualizar a OS com uma versão nova do orçamento (já aprovada): comparação linha a linha e confirmação. */
export default async function QuoteSyncPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getWorkOrderService(id);
  if (!data) notFound();
  const preview = await getQuoteSyncPreviewService(id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href={`/dashboard/os/${id}/detalhes`} className="text-sm text-muted hover:underline">
        ← Voltar para a OS
      </Link>
      <h1 className="text-lg font-semibold tracking-tight">Atualizar a OS com o orçamento</h1>
      {preview.available ? (
        <QuoteSyncForm workOrderId={id} preview={preview} />
      ) : (
        <p className="rounded-2xl border border-border bg-surface p-5 text-sm">{preview.reason}</p>
      )}
    </div>
  );
}
