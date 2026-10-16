"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateReceptionInfoAction } from "../receptionActions";

export function DamagesEditor({
  workOrderId,
  initialValue,
  locked,
}: {
  workOrderId: string;
  initialValue: string | null;
  locked: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateReceptionInfoAction(workOrderId, value);
      if (!result.success) {
        setError(result.error ?? "Falha ao salvar.");
        return;
      }
      router.refresh();
    });
  }

  if (locked) {
    return <p className="whitespace-pre-wrap text-sm">{initialValue || "Nenhuma avaria declarada."}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        placeholder="Ex.: risco no para-choque traseiro, amassado na porta esquerda"
        className="rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="h-9 self-start rounded-lg border border-border px-4 text-xs font-semibold disabled:opacity-60"
      >
        {isPending ? "Salvando…" : "Salvar avarias"}
      </button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
