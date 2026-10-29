"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createServiceAction, updateServiceAction } from "./actions";

export function ServiceForm({
  serviceId,
  initial,
}: {
  serviceId?: string;
  initial?: {
    name: string;
    category: string;
    defaultPriceReais: string;
    costReais: string;
    intervalMonths?: string;
    intervalKm?: string;
  };
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [defaultPriceReais, setDefaultPriceReais] = useState(initial?.defaultPriceReais ?? "");
  const [costReais, setCostReais] = useState(initial?.costReais ?? "");
  const [intervalMonths, setIntervalMonths] = useState(initial?.intervalMonths ?? "");
  const [intervalKm, setIntervalKm] = useState(initial?.intervalKm ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const inputClass =
    "h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const payload = { name, category, defaultPriceReais, costReais, intervalMonths, intervalKm };
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

      <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-3">
        <p className="text-sm font-medium">Repetir a cada… (opcional, para lembrar a próxima troca)</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted" htmlFor="intervalMonths">Meses</label>
            <input
              id="intervalMonths"
              inputMode="numeric"
              value={intervalMonths}
              onChange={(e) => setIntervalMonths(e.target.value)}
              className={inputClass}
              placeholder="Ex.: 6"
            />
            {fieldErrors.intervalMonths ? <p className="text-xs text-danger">{fieldErrors.intervalMonths}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted" htmlFor="intervalKm">Quilômetros</label>
            <input
              id="intervalKm"
              inputMode="numeric"
              value={intervalKm}
              onChange={(e) => setIntervalKm(e.target.value)}
              className={inputClass}
              placeholder="Ex.: 10000"
            />
            {fieldErrors.intervalKm ? <p className="text-xs text-danger">{fieldErrors.intervalKm}</p> : null}
          </div>
        </div>
        <p className="text-xs text-muted">
          Ex.: troca de óleo a cada 6 meses ou 10.000 km (vale o que vencer primeiro). Deixe em branco se o serviço não se repete.
          O sistema mostra a próxima troca na ficha do veículo e sugere o lembrete em Mensagens.
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
