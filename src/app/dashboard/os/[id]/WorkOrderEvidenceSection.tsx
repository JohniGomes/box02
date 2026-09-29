"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createWorkOrderEvidenceAction, deleteWorkOrderEvidenceAction } from "../evidenceActions";

const TYPE_LABEL: Record<string, string> = {
  GERAL: "Geral (entrada)",
  AVARIA: "Avaria",
};

export interface WorkOrderEvidenceView {
  id: string;
  type: string;
  description: string | null;
  createdAt: string;
}

/**
 * Ciclo J — REGISTRAMOS. Vinculada só à OS (DEC-J4). Antes do aceite de
 * recepção, tudo é livre (adicionar/excluir); depois, evidências
 * existentes ficam imutáveis — só adicionar continua permitido
 * (DEC-J5). Acesso só interno (DEC-J6): a imagem é sempre carregada
 * pela rota autenticada da própria aplicação, nunca por URL do R2.
 */
export function WorkOrderEvidenceSection({
  workOrderId,
  evidences,
  locked,
}: {
  workOrderId: string;
  evidences: WorkOrderEvidenceView[];
  locked: boolean;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState("GERAL");
  const [description, setDescription] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Selecione um arquivo.");
      return;
    }
    setError(null);

    const formData = new FormData();
    formData.set("file", file);
    formData.set("type", type);
    if (description) formData.set("description", description);

    startTransition(async () => {
      const result = await createWorkOrderEvidenceAction(workOrderId, formData);
      if (!result.success) {
        setError(result.error ?? "Falha ao salvar.");
        return;
      }
      setDescription("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    });
  }

  function handleDelete(evidenceId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteWorkOrderEvidenceAction(workOrderId, evidenceId);
      if (!result.success) {
        setError(result.error ?? "Falha ao excluir.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Registramos — Evidências</h2>
      <p className="mb-3 text-[11px] text-muted">
        Fotos de entrada e avarias, vinculadas a esta OS.
        {locked ? " O aceite de recepção já foi registrado — evidências existentes não podem mais ser excluídas." : ""}
      </p>

      {evidences.length === 0 ? (
        <p className="mb-3 text-sm text-muted">Nenhuma evidência registrada ainda.</p>
      ) : (
        <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {evidences.map((ev) => (
            <li key={ev.id} className="flex flex-col gap-1 rounded-xl border border-border p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- imagem servida por rota autenticada própria (DEC-J6), não um asset estático */}
              <img
                src={`/dashboard/os/${workOrderId}/evidence/${ev.id}`}
                alt={TYPE_LABEL[ev.type] ?? ev.type}
                className="aspect-square w-full rounded-lg object-cover"
              />
              <span className="text-[10px] font-semibold text-muted">{TYPE_LABEL[ev.type] ?? ev.type}</span>
              {ev.description ? <span className="text-[10px] text-muted">{ev.description}</span> : null}
              {!locked ? (
                <button
                  onClick={() => handleDelete(ev.id)}
                  disabled={isPending}
                  className="mt-1 text-[10px] font-medium text-danger disabled:opacity-50"
                >
                  Excluir
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/heic"
          className="text-sm"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
        >
          <option value="GERAL">Geral (entrada)</option>
          <option value="AVARIA">Avaria</option>
        </select>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descrição (opcional)"
          className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
        />
        <button
          onClick={handleUpload}
          disabled={isPending}
          className="h-11 rounded-xl border border-border text-sm font-semibold disabled:opacity-60"
        >
          {isPending ? "Enviando…" : "Adicionar evidência"}
        </button>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    </section>
  );
}
