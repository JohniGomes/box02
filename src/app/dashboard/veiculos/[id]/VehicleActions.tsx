"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  inactivateVehicleAction,
  reactivateVehicleAction,
  transferVehicleAction,
} from "../actions";
import { CustomerPicker } from "../CustomerPicker";
import type { VehicleStatus } from "@/lib/db/repositories/vehicles";

export function VehicleStatusActions({
  vehicleId,
  status,
}: {
  vehicleId: string;
  status: VehicleStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleInactivate() {
    setError(null);
    startTransition(async () => {
      const result = await inactivateVehicleAction(vehicleId);
      if (!result.success) {
        setError(result.error ?? "Falha ao inativar.");
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  function handleReactivate() {
    setError(null);
    startTransition(async () => {
      const result = await reactivateVehicleAction(vehicleId);
      if (!result.success) {
        setError(result.error ?? "Falha ao reativar.");
        return;
      }
      router.refresh();
    });
  }

  if (status === "INATIVO") {
    return (
      <div className="flex flex-col gap-2">
        <button
          onClick={handleReactivate}
          disabled={isPending}
          className="h-11 rounded-xl border border-border px-4 text-sm font-medium disabled:opacity-60"
        >
          {isPending ? "Reativando…" : "Reativar veículo"}
        </button>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-danger/30 bg-danger/5 p-4">
        <p className="text-sm">
          Inativar este veículo? O histórico não será apagado — ele só deixa de aparecer nas
          buscas padrão.
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleInactivate}
            disabled={isPending}
            className="h-10 flex-1 rounded-lg bg-danger text-sm font-semibold text-white disabled:opacity-60"
          >
            {isPending ? "Inativando…" : "Confirmar"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="h-10 flex-1 rounded-lg border border-border text-sm font-medium"
          >
            Cancelar
          </button>
        </div>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="h-11 rounded-xl border border-danger/40 px-4 text-sm font-medium text-danger"
    >
      Inativar veículo
    </button>
  );
}

export function TransferVehicleAction({ vehicleId }: { vehicleId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<{ id: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleTransfer() {
    if (!target) return;
    setError(null);
    startTransition(async () => {
      const result = await transferVehicleAction(vehicleId, target.id);
      if (!result.success) {
        setError(result.error ?? "Falha ao transferir.");
        return;
      }
      setOpen(false);
      setTarget(null);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="h-11 rounded-xl border border-border px-4 text-sm font-medium"
      >
        Transferir para outro cliente
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <p className="text-sm font-medium">Transferir veículo</p>
      <CustomerPicker value={target} onChange={setTarget} />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <button
          onClick={handleTransfer}
          disabled={!target || isPending}
          className="h-10 flex-1 rounded-lg bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          {isPending ? "Transferindo…" : "Confirmar transferência"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setTarget(null);
            setError(null);
          }}
          className="h-10 flex-1 rounded-lg border border-border text-sm font-medium"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
