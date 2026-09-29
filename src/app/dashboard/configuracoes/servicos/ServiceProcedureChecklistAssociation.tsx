"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { listAssociationOptionsAction, setServiceProcedureAndChecklistAction } from "./actions";

export function ServiceProcedureChecklistAssociation({
  serviceId,
  currentProcedureId,
  currentChecklistId,
}: {
  serviceId: string;
  currentProcedureId: string | null;
  currentChecklistId: string | null;
}) {
  const router = useRouter();
  const [procedures, setProcedures] = useState<{ id: string; label: string }[]>([]);
  const [checklists, setChecklists] = useState<{ id: string; label: string }[]>([]);
  const [procedureId, setProcedureId] = useState(currentProcedureId ?? "");
  const [checklistId, setChecklistId] = useState(currentChecklistId ?? "");
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAssociationOptionsAction().then((opts) => {
      setProcedures(opts.procedures);
      setChecklists(opts.checklists);
      setLoaded(true);
    });
  }, []);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await setServiceProcedureAndChecklistAction(serviceId, {
        procedureId: procedureId || null,
        executionChecklistId: checklistId || null,
      });
      if (!result.success) {
        setError(result.error ?? "Falha ao salvar.");
        return;
      }
      router.refresh();
    });
  }

  const selectClass =
    "h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="mb-3 text-sm font-semibold">Procedimento e checklist de execução</h2>
      <p className="mb-3 text-xs text-muted">Ambos opcionais — o serviço funciona normalmente sem nenhum dos dois.</p>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Procedimento</label>
          <select value={procedureId} onChange={(e) => setProcedureId(e.target.value)} className={selectClass} disabled={!loaded}>
            <option value="">Nenhum</option>
            {procedures.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Checklist de execução</label>
          <select value={checklistId} onChange={(e) => setChecklistId(e.target.value)} className={selectClass} disabled={!loaded}>
            <option value="">Nenhum</option>
            {checklists.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}

      <button
        onClick={handleSave}
        disabled={isPending || !loaded}
        className="mt-3 h-11 w-full rounded-xl border border-border text-sm font-semibold disabled:opacity-60"
      >
        {isPending ? "Salvando…" : "Salvar associação"}
      </button>
    </section>
  );
}
