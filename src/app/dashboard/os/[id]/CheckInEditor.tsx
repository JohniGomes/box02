"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCheckInAction } from "../receptionActions";

/**
 * Queixa do cliente e KM do painel — podem ser corrigidos até o aceite do
 * Termo de Recepção. Depois do aceite o Termo guarda o que valia na hora.
 */
export function CheckInEditor({
  workOrderId,
  initialComplaint,
  initialMileage,
}: {
  workOrderId: string;
  initialComplaint: string | null;
  initialMileage: number | null;
}) {
  const router = useRouter();
  const [complaint, setComplaint] = useState(initialComplaint ?? "");
  const [mileage, setMileage] = useState(initialMileage !== null ? String(initialMileage) : "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateCheckInAction(workOrderId, { customerComplaint: complaint, mileageAtEntry: mileage });
      if (!result.success) {
        setError(result.error ?? "Falha ao salvar.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 print:hidden">
      <textarea
        value={complaint}
        onChange={(e) => setComplaint(e.target.value)}
        rows={3}
        placeholder="O que o cliente relatou (ex.: barulho na frente ao frear)"
        className="rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
      />
      <div className="flex flex-col gap-1">
        <label htmlFor="checkinKm" className="text-xs text-muted">
          KM do painel
        </label>
        <input
          id="checkinKm"
          value={mileage}
          onChange={(e) => setMileage(e.target.value)}
          inputMode="numeric"
          placeholder="Ex.: 98000"
          className="h-11 rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </div>
      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="h-9 self-start rounded-lg border border-border px-4 text-xs font-semibold disabled:opacity-60"
      >
        {isPending ? "Salvando…" : "Salvar queixa e KM"}
      </button>
      <p className="text-xs text-muted">Dá para corrigir até o cliente aceitar o Termo. Depois do aceite, o Termo guarda esta versão.</p>
      {saved ? <p className="text-xs text-success">Salvo.</p> : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
