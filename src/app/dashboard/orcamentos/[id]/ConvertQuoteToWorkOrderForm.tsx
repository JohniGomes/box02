"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createWorkOrderFromQuoteAction } from "../../os/actions";

export function ConvertQuoteToWorkOrderForm({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [mileageAtEntry, setMileageAtEntry] = useState("");
  const [customerComplaint, setCustomerComplaint] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const result = await createWorkOrderFromQuoteAction(quoteId, {
      mileageAtEntry,
      customerComplaint,
    });

    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Não foi possível converter em OS.");
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    router.push(`/dashboard/os/${result.workOrderId}`);
    router.refresh();
  }

  const inputClass =
    "h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold">Check-in do veículo</h2>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="mileage">Quilometragem de entrada</label>
        <input
          id="mileage"
          inputMode="numeric"
          value={mileageAtEntry}
          onChange={(e) => setMileageAtEntry(e.target.value)}
          className={inputClass}
          placeholder="Ex.: 45000"
        />
        {fieldErrors.mileageAtEntry ? <p className="text-xs text-danger">{fieldErrors.mileageAtEntry}</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="complaint">Queixa do cliente (opcional)</label>
        <textarea
          id="complaint"
          value={customerComplaint}
          onChange={(e) => setCustomerComplaint(e.target.value)}
          rows={2}
          className="rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!mileageAtEntry || submitting}
        className="h-12 rounded-xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50"
      >
        {submitting ? "Criando OS…" : "Criar OS a partir deste orçamento"}
      </button>
    </div>
  );
}
