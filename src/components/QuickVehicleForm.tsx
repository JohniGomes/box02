"use client";

import { useState, useTransition } from "react";
import { createQuickVehicleAction } from "@/app/dashboard/venda-rapida/actions";

const inputClass =
  "h-11 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent";

/**
 * Cadastro mínimo de veículo sem sair da tela: modelo e/ou placa. Reaproveita o
 * veículo se a placa já é deste cliente; recusa placa de outro cliente.
 */
export function QuickVehicleForm({
  customerId,
  onCreated,
}: {
  customerId: string;
  onCreated: (vehicle: { id: string; label: string }, reused: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState("");
  const [plate, setPlate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const result = await createQuickVehicleAction({
        customerId,
        model: model || undefined,
        plate: plate || undefined,
      });
      if (!result.success || !result.vehicle) {
        setError(result.error ?? "Não foi possível cadastrar o veículo.");
        return;
      }
      onCreated(result.vehicle, Boolean(result.reused));
      setModel("");
      setPlate("");
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-10 rounded-lg border border-dashed border-border px-3 text-xs font-semibold text-muted"
      >
        + Veículo novo (modelo e/ou placa)
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">Veículo novo — cadastro rápido</span>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted">
          Fechar
        </button>
      </div>
      <input
        value={model}
        onChange={(e) => setModel(e.target.value)}
        placeholder="Modelo (ex.: Gol 1.0 2012)"
        className={inputClass}
      />
      <input
        value={plate}
        onChange={(e) => setPlate(e.target.value)}
        placeholder="Placa (opcional)"
        className={inputClass}
      />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <button
        type="button"
        onClick={handleCreate}
        disabled={isPending || (!model.trim() && !plate.trim())}
        className="h-11 rounded-lg bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-50"
      >
        {isPending ? "Cadastrando…" : "Cadastrar e usar"}
      </button>
    </div>
  );
}
