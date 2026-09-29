"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProcedureAction, updateProcedureAction } from "./actions";

export function ProcedureForm({
  procedureId,
  initial,
}: {
  procedureId?: string;
  initial?: {
    code: string;
    title: string;
    objective: string;
    prerequisites: string;
    steps: string;
    completionCriteria: string;
  };
}) {
  const router = useRouter();
  const [code, setCode] = useState(initial?.code ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [objective, setObjective] = useState(initial?.objective ?? "");
  const [prerequisites, setPrerequisites] = useState(initial?.prerequisites ?? "");
  const [steps, setSteps] = useState(initial?.steps ?? "");
  const [completionCriteria, setCompletionCriteria] = useState(initial?.completionCriteria ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const inputClass =
    "h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";
  const textareaClass =
    "rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const payload = { code, title, objective, prerequisites, steps, completionCriteria };
    const result = procedureId
      ? await updateProcedureAction(procedureId, payload)
      : await createProcedureAction(payload);

    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Não foi possível salvar.");
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    router.push(`/dashboard/configuracoes/procedimentos/${result.procedureId}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="code">Código</label>
        <input id="code" value={code} onChange={(e) => setCode(e.target.value)} className={inputClass} placeholder="Ex.: POP-001" />
        {fieldErrors.code ? <p className="text-xs text-danger">{fieldErrors.code}</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="title">Título</label>
        <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="Ex.: Recepção e identificação do veículo" />
        {fieldErrors.title ? <p className="text-xs text-danger">{fieldErrors.title}</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="objective">Objetivo (opcional)</label>
        <textarea id="objective" value={objective} onChange={(e) => setObjective(e.target.value)} rows={2} className={textareaClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="prerequisites">Pré-requisitos (opcional)</label>
        <textarea id="prerequisites" value={prerequisites} onChange={(e) => setPrerequisites(e.target.value)} rows={2} className={textareaClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="steps">Passos (opcional)</label>
        <textarea id="steps" value={steps} onChange={(e) => setSteps(e.target.value)} rows={4} className={textareaClass} placeholder="Texto livre, com quebras de linha se quiser" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="completionCriteria">Critério de conclusão (opcional)</label>
        <textarea id="completionCriteria" value={completionCriteria} onChange={(e) => setCompletionCriteria(e.target.value)} rows={2} className={textareaClass} />
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !code.trim() || !title.trim()}
        className="h-12 rounded-xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50"
      >
        {submitting ? "Salvando…" : procedureId ? "Salvar alterações" : "Criar procedimento"}
      </button>
    </div>
  );
}
