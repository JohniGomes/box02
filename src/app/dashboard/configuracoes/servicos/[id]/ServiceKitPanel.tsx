"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatBRL } from "@/lib/money";
import { deleteServiceKitAction } from "../actions";

export interface KitLineView {
  id: string;
  type: "PECA" | "MAO_DE_OBRA";
  description: string;
  quantity: number;
  priceCents: number | null;
  partName: string | null;
}

/** Kit do serviço (lista usual de peças e mão de obra). O kit é montado e salvo no orçamento, pelo botão "Salvar como kit". */
export function ServiceKitPanel({ serviceId, lines }: { serviceId: string; lines: KitLineView[] }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteServiceKitAction(serviceId);
      if (!result.success) {
        setError(result.error ?? "Não foi possível apagar.");
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold">Kit do serviço</h2>
      <p className="mt-1 text-xs text-muted">
        Peças e mão de obra que entram juntas no orçamento (sempre editáveis). Para criar ou trocar o kit, monte o serviço num
        orçamento e use &quot;Salvar como kit&quot;.
      </p>
      {lines.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Este serviço ainda não tem kit.</p>
      ) : (
        <>
          <ul className="mt-3 flex flex-col gap-1.5">
            {lines.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-2 text-sm">
                <span>
                  <span className="text-xs text-muted">{l.type === "PECA" ? "Peça" : "Mão de obra"}: </span>
                  {l.partName ?? l.description}
                  {l.type === "PECA" && !l.partName ? <span className="text-xs text-muted"> (vaga a escolher do estoque)</span> : null}
                  {l.quantity !== 1 ? <span className="text-xs text-muted"> × {l.quantity}</span> : null}
                </span>
                {l.priceCents != null ? <span className="shrink-0 font-medium">{formatBRL(l.priceCents)}</span> : null}
              </li>
            ))}
          </ul>
          {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
          {confirming ? (
            <div className="mt-3 flex gap-2">
              <button onClick={remove} disabled={isPending} className="h-9 rounded-lg bg-danger/15 px-3 text-xs font-semibold text-danger disabled:opacity-50">
                {isPending ? "Apagando…" : "Sim, apagar o kit"}
              </button>
              <button onClick={() => setConfirming(false)} className="h-9 rounded-lg border border-border px-3 text-xs">
                Voltar
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirming(true)} className="mt-3 h-9 rounded-lg border border-border px-3 text-xs font-medium text-danger">
              Apagar kit
            </button>
          )}
        </>
      )}
    </section>
  );
}
