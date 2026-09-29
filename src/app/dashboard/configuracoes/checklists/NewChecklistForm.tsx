"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createChecklistAction } from "./actions";

type ChecklistType = "ENTRADA" | "EXECUCAO" | "ENTREGA";
const TYPE_LABEL: Record<ChecklistType, string> = { ENTRADA: "Entrada", EXECUCAO: "Execução", ENTREGA: "Entrega" };

export function NewChecklistForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<ChecklistType>("EXECUCAO");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const inputClass =
    "h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const result = await createChecklistAction({ code, name, type });

    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Não foi possível salvar.");
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    router.push(`/dashboard/configuracoes/checklists/${result.checklistId}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="code">Código</label>
        <input id="code" value={code} onChange={(e) => setCode(e.target.value)} className={inputClass} placeholder="Ex.: CHK-001" />
        {fieldErrors.code ? <p className="text-xs text-danger">{fieldErrors.code}</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="name">Nome</label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Ex.: Checklist de entrada" />
        {fieldErrors.name ? <p className="text-xs text-danger">{fieldErrors.name}</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Tipo</label>
        <div className="flex gap-2">
          {(Object.keys(TYPE_LABEL) as ChecklistType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex-1 rounded-xl border px-2 py-2 text-sm font-medium ${
                type === t ? "border-accent bg-accent/15" : "border-border text-muted"
              }`}
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        {(type === "ENTRADA" || type === "ENTREGA") && (
          <p className="text-xs text-muted">
            Tipos Entrada e Entrega são únicos por oficina — só um pode estar ativo por vez.
          </p>
        )}
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !code.trim() || !name.trim()}
        className="h-12 rounded-xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50"
      >
        {submitting ? "Salvando…" : "Criar checklist"}
      </button>
    </div>
  );
}
