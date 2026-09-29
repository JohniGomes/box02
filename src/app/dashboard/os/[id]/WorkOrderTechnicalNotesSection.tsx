"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateTechnicalNotesAction } from "../methodActions";

/**
 * Ciclo G — registro técnico da entrega (technicalNotes). Disponível a
 * partir de PRONTA, continua editável depois de ENTREGUE — sem gate, sem
 * write-once, sem interferir no fechamento da OS (mesmo padrão exato de
 * WorkOrderExplanationSection).
 */
export function WorkOrderTechnicalNotesSection({
  workOrderId,
  technicalNotes,
  applicable,
}: {
  workOrderId: string;
  technicalNotes: string | null;
  /** true quando status = PRONTA ou ENTREGUE — não depende de
   * isOpenForCancel, porque continua editável mesmo depois de ENTREGUE. */
  applicable: boolean;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(technicalNotes ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateTechnicalNotesAction(workOrderId, notes);
      if (!result.success) {
        setError(result.error ?? "Falha ao salvar.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-accent">Entrega Técnica</h2>
        <Link href={`/dashboard/os/${workOrderId}/entrega-tecnica`} className="text-xs font-medium text-accent">
          Ver Entrega Técnica →
        </Link>
      </div>

      {!applicable ? (
        <p className="text-sm text-muted">Disponível a partir do status Pronta.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium text-muted" htmlFor="technicalNotes">
            Situação final do veículo e orientações pós-serviço
          </label>
          <textarea
            id="technicalNotes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            placeholder="Ex.: Veículo testado, sem ruídos. Recomendamos revisar o nível de óleo em 3 meses."
          />
          <button
            onClick={handleSave}
            disabled={isPending}
            className="h-10 self-start rounded-lg border border-border px-4 text-xs font-semibold disabled:opacity-60"
          >
            {isPending ? "Salvando…" : "Salvar registro técnico"}
          </button>
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      )}
    </section>
  );
}
