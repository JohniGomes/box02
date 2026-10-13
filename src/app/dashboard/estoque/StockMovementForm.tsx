"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createStockMovementAction } from "./actions";

export function StockMovementForm({ partId, unit }: { partId: string; unit: string }) {
  const router = useRouter();
  const [type, setType] = useState<"ENTRADA" | "SAIDA">("ENTRADA");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    const result = await createStockMovementAction(partId, { type, quantity, reason });

    setSubmitting(false);

    if (!result.success) {
      setError(result.error ?? "Não foi possível registrar.");
      return;
    }

    setQuantity("");
    setReason("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold">Lançar movimentação</h2>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setType("ENTRADA")}
          className={`h-11 rounded-xl border text-sm font-semibold ${
            type === "ENTRADA" ? "border-success bg-success/15 text-success" : "border-border text-muted"
          }`}
        >
          Entrada
        </button>
        <button
          type="button"
          onClick={() => setType("SAIDA")}
          className={`h-11 rounded-xl border text-sm font-semibold ${
            type === "SAIDA" ? "border-danger bg-danger/15 text-danger" : "border-border text-muted"
          }`}
        >
          Saída
        </button>
      </div>

      <div className="flex gap-2">
        <input
          inputMode="numeric"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder={`Quantidade (${unit})`}
          className="h-11 flex-1 rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </div>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo (opcional) — ex.: compra, uso em OS-000012, ajuste de contagem"
        className="h-11 rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
      />

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <button
        type="button"
        disabled={submitting || !quantity.trim()}
        onClick={handleSubmit}
        className="h-11 rounded-xl bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-50"
      >
        {submitting ? "Registrando…" : "Registrar"}
      </button>
    </div>
  );
}
