"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPartAction, updatePartAction, type InventoryActionResult } from "./actions";
import { calculateSalePriceCents, centsToReais, formatBRL, markupPercentForPrice, reaisToCents } from "@/lib/money";
import type { PartFormValues } from "./partFormValues";
import { SkuSuggest } from "./SkuSuggest";

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
    initialValues ?? { name: "", sku: "", unit: "un", costReais: "", minStock: "", markupPercent: "", notes: "", isConsumable: false },
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof PartFormValues>(key: K, value: PartFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const costCents = values.costReais.trim() !== "" ? reaisToCents(values.costReais) : null;
  const markup = values.markupPercent.trim() !== "" ? Number(values.markupPercent.replace(",", ".")) : null;
  const suggestedPriceCents =
    costCents !== null && markup !== null && Number.isFinite(markup)
      ? calculateSalePriceCents(costCents, markup)
      : null;

  // Preço de venda digitado: é só outra forma de informar o markup. O que é
  // gravado continua sendo o percentual (o preço nunca é armazenado).
  const [priceReais, setPriceReais] = useState(() =>
    suggestedPriceCents !== null ? centsToReais(suggestedPriceCents) : "",
  );
  const [priceError, setPriceError] = useState<string | null>(null);

  function handlePriceChange(text: string) {
    setPriceReais(text);
    setPriceError(null);
    if (text.trim() === "") {
      update("markupPercent", "");
      return;
    }
    if (costCents === null || costCents <= 0) {
      setPriceError("Informe o custo unitário primeiro para calcular o %.");
      return;
    }
    const priceCents = reaisToCents(text);
    const percent = markupPercentForPrice(costCents, priceCents);
    if (percent === null || percent < 0) {
      setPriceError("O preço de venda está abaixo do custo.");
      return;
    }
    update("markupPercent", String(percent));
  }

  function handleMarkupChange(text: string) {
    update("markupPercent", text);
    setPriceError(null);
    const m = text.trim() !== "" ? Number(text.replace(",", ".")) : null;
    if (costCents !== null && m !== null && Number.isFinite(m)) {
      setPriceReais(centsToReais(calculateSalePriceCents(costCents, m)));
    } else if (text.trim() === "") {
      setPriceReais("");
    }
  }

  function handleCostChange(text: string) {
    update("costReais", text);
    setPriceError(null);
    // Mantém o markup e recalcula o preço sugerido quando o custo muda.
    const c = text.trim() !== "" ? reaisToCents(text) : null;
    if (c !== null && markup !== null && Number.isFinite(markup)) {
      setPriceReais(centsToReais(calculateSalePriceCents(c, markup)));
    }
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
      markupPercent: values.markupPercent,
      notes: values.notes,
      isConsumable: values.isConsumable,
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

      <SkuSuggest partName={values.name} hasSku={values.sku.trim() !== ""} onUse={(code) => update("sku", code)} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Custo unitário (opcional)" htmlFor="costReais">
          <input
            id="costReais"
            inputMode="decimal"
            value={values.costReais}
            onChange={(e) => handleCostChange(e.target.value)}
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

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Preço de venda — informe por valor OU por %</span>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vendo por (R$)" htmlFor="priceReais">
            <input
              id="priceReais"
              inputMode="decimal"
              value={priceReais}
              onChange={(e) => handlePriceChange(e.target.value)}
              className={inputClass}
              placeholder="Ex.: 520,00"
            />
          </Field>
          <Field label="Markup — lucro, % (opcional)" htmlFor="markupPercent">
            <input
              id="markupPercent"
              inputMode="decimal"
              value={values.markupPercent}
              onChange={(e) => handleMarkupChange(e.target.value)}
              className={inputClass}
              placeholder="Ex.: 30"
            />
          </Field>
        </div>
        {priceError ? <p className="text-xs text-danger">{priceError}</p> : null}
        <p className="text-xs text-muted">
          Preencha um e o outro é calculado na hora. Sem preencher nenhum, usa o markup padrão configurado em
          Configurações → Precificação.
        </p>
      </div>

      {suggestedPriceCents !== null && costCents !== null && costCents > 0 ? (
        <div className="rounded-xl bg-success/10 p-4">
          <p className="text-xs text-muted">Preço de venda sugerido</p>
          <p className="text-xl font-semibold text-success">{formatBRL(suggestedPriceCents)}</p>
          <p className="mt-1 text-xs text-muted">
            Custo {formatBRL(costCents)} · lucro {formatBRL(suggestedPriceCents - costCents)} (
            {String(markup).replace(".", ",")}%)
          </p>
        </div>
      ) : null}

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3">
        <input
          type="checkbox"
          checked={values.isConsumable}
          onChange={(e) => update("isConsumable", e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0"
        />
        <span className="text-sm">
          <span className="block font-medium">Insumo (uso interno da oficina)</span>
          <span className="block text-xs text-muted">
            Fica no estoque e entra nas compras, mas não aparece para escolher nos orçamentos. Ex.: óleo, estopa.
          </span>
        </span>
      </label>

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
