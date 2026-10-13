"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPartAction, updatePartAction, type InventoryActionResult } from "./actions";
import type { PartRecord } from "@/lib/db/repositories/parts";
import { centsToReais } from "@/lib/money";

export interface PartFormValues {
  name: string;
  sku: string;
  unit: string;
  costReais: string;
  minStock: string;
  notes: string;
}

export function partRecordToFormValues(part: PartRecord): PartFormValues {
  return {
    name: part.name,
    sku: part.sku ?? "",
    unit: part.unit,
    costReais: part.costCents !== null ? centsToReais(part.costCents) : "",
    minStock: part.minStock !== null ? String(part.minStock) : "",
    notes: part.notes ?? "",
  };
}

const inputClass =
  "h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

export function PartForm({
  mode,
  partId,
  initialValues,
}: {
  mode: "create" | "edit";
  partId?: string;
  initialValues?: PartFormValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState<PartFormValues>(
    initialValues ?? { name: "", sku: "", unit: "un", costReais: "", minStock: "", notes: "" },
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof PartFormValues>(key: K, value: PartFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    const payload = {
      name: values.name,
      sku: values.sku,
      unit: values.unit || "un",
      costReais: values.costReais,
      minStock: values.minStock,
      notes: values.notes,
    };

    let result: InventoryActionResult;
    if (mode === "create") {
      result = await createPartAction(payload);
    } else {
      result = await updatePartAction(partId as string, payload);
    }

    setSubmitting(false);

    if (!result.success) {
      setFormError(result.error ?? "Não foi possível salvar.");
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }

    router.push(`/dashboard/estoque/${result.partId}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <Field label="Nome" htmlFor="name" error={fieldErrors.name}>
        <input
          id="name"
          value={values.name}
          onChange={(e) => update("name", e.target.value)}
          className={inputClass}
          placeholder="Ex.: Filtro de óleo"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="SKU / código (opcional)" htmlFor="sku" error={fieldErrors.sku}>
          <input id="sku" value={values.sku} onChange={(e) => update("sku", e.target.value)} className={inputClass} />
        </Field>
        <Field label="Unidade" htmlFor="unit">
          <input
            id="unit"
            value={values.unit}
            onChange={(e) => update("unit", e.target.value)}
            className={inputClass}
            placeholder="un, L, kg…"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Custo unitário (opcional)" htmlFor="costReais">
          <input
            id="costReais"
            inputMode="decimal"
            value={values.costReais}
            onChange={(e) => update("costReais", e.target.value)}
            className={inputClass}
            placeholder="0,00"
          />
        </Field>
        <Field label="Estoque mínimo (opcional)" htmlFor="minStock">
          <input
            id="minStock"
            inputMode="numeric"
            value={values.minStock}
            onChange={(e) => update("minStock", e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Observações (opcional)" htmlFor="notes">
        <textarea
          id="notes"
          value={values.notes}
          onChange={(e) => update("notes", e.target.value)}
          rows={3}
          className="rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </Field>

      {formError ? <p className="text-sm text-danger">{formError}</p> : null}

      <button
        type="button"
        disabled={submitting || !values.name.trim()}
        onClick={handleSubmit}
        className="h-12 rounded-xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50"
      >
        {submitting ? "Salvando…" : mode === "create" ? "Cadastrar peça" : "Salvar alterações"}
      </button>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
