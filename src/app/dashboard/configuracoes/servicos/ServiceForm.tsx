"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createServiceAction, updateServiceAction } from "./actions";

export function ServiceForm({
  serviceId,
  initial,
}: {
  serviceId?: string;
  initial?: { name: string; category: string; defaultPriceReais: string; costReais: string };
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [defaultPriceReais, setDefaultPriceReais] = useState(initial?.defaultPriceReais ?? "");
  const [costReais, setCostReais] = useState(initial?.costReais ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const inputClass =
    "h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const payload = { name, category, defaultPriceReais, costReais };
    const result = serviceId
      ? await updateServiceAction(serviceId, payload)
      : await createServiceAction(payload);

    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Não foi possível salvar.");
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    router.push(`/dashboard/configuracoes/servicos/${result.serviceId}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="name">Nome do serviço</label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          placeholder="Ex.: Alinhamento"
        />
        {fieldErrors.name ? <p className="text-xs text-danger">{fieldErrors.name}</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="category">Categoria (opcional)</label>
        <input
          id="category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={inputClass}
          placeholder="Ex.: Suspensão"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="price">Preço padrão (opcional)</label>
        <input
          id="price"
          inputMode="decimal"
          value={defaultPriceReais}
          onChange={(e) => setDefaultPriceReais(e.target.value)}
          className={inputClass}
          placeholder="R$ (deixe em branco se variável)"
        />
      </div>
      <div className="flex flex-col gap-1.5 rounded-xl border border-dashed border-border p-3">
        <label className="text-sm font-medium" htmlFor="cost">Custo estimado (opcional, interno)</label>
        <input
          id="cost"
          inputMode="decimal"
          value={costReais}
          onChange={(e) => setCostReais(e.target.value)}
          className={inputClass}
          placeholder="R$ — nunca aparece para o cliente"
        />
        <p className="text-xs text-muted">
          Usado só para calcular um preço sugerido de referência (quando não houver preço padrão manual).
          Nunca aparece em orçamento, OS ou qualquer documento do cliente.
        </p>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !name.trim()}
        className="h-12 rounded-xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50"
      >
        {submitting ? "Salvando…" : serviceId ? "Salvar alterações" : "Criar serviço"}
      </button>
    </div>
  );
}
