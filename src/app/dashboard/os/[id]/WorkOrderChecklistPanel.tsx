"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  checkWorkOrderChecklistItemAction,
  completeWorkOrderChecklistAction,
  startWorkOrderChecklistAction,
} from "../checklistActions";

export interface WorkOrderChecklistItemView {
  id: string;
  description: string;
  required: boolean;
  checked: boolean;
}

export interface WorkOrderChecklistView {
  id: string;
  code: string;
  name: string;
  startedAt: string;
  completedAt: string | null;
  items: WorkOrderChecklistItemView[];
}

const TYPE_LABEL: Record<string, string> = {
  ENTRADA: "Checklist de entrada",
  EXECUCAO: "Checklist de execução",
  ENTREGA: "Checklist de entrega",
};

export function WorkOrderChecklistPanel({
  workOrderId,
  type,
  workOrderItemId,
  initial,
  canManage,
}: {
  workOrderId: string;
  type: "ENTRADA" | "EXECUCAO" | "ENTREGA";
  workOrderItemId?: string;
  initial: WorkOrderChecklistView | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleStart() {
    setError(null);
    startTransition(async () => {
      const result = await startWorkOrderChecklistAction(workOrderId, type, workOrderItemId);
      if (!result.success) {
        setError(result.error ?? "Falha ao iniciar.");
        return;
      }
      router.refresh();
    });
  }

  function handleToggle(itemId: string, checked: boolean) {
    if (!initial) return;
    startTransition(async () => {
      await checkWorkOrderChecklistItemAction(workOrderId, initial.id, itemId, checked);
      router.refresh();
    });
  }

  function handleComplete() {
    if (!initial) return;
    startTransition(async () => {
      await completeWorkOrderChecklistAction(workOrderId, initial.id);
      router.refresh();
    });
  }

  if (!initial) {
    if (!canManage) return null;
    return (
      <div className="rounded-xl border border-border bg-background p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{TYPE_LABEL[type]}</span>
          <button
            onClick={handleStart}
            disabled={isPending}
            className="h-9 rounded-lg border border-accent px-3 text-xs font-semibold text-accent disabled:opacity-60"
          >
            {isPending ? "Iniciando…" : "Iniciar"}
          </button>
        </div>
        {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      </div>
    );
  }

  const pendingRequired = initial.items.filter((i) => i.required && !i.checked).length;

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{initial.code} — {initial.name}</span>
        {initial.completedAt ? (
          <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
            Finalizado
          </span>
        ) : pendingRequired > 0 ? (
          <span className="rounded-full bg-muted/20 px-2 py-0.5 text-[11px] font-semibold text-muted">
            {pendingRequired} obrigatório(s) pendente(s)
          </span>
        ) : (
          <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
            Tudo marcado
          </span>
        )}
      </div>

      <ul className="flex flex-col gap-1.5">
        {initial.items.map((item) => (
          <li key={item.id}>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={item.checked}
                disabled={!canManage || isPending}
                onChange={(e) => handleToggle(item.id, e.target.checked)}
                className="mt-0.5"
              />
              <span className={item.checked ? "text-muted line-through" : ""}>
                {item.description}
                {item.required ? <span className="ml-1 text-[10px] text-danger">obrigatório</span> : null}
              </span>
            </label>
          </li>
        ))}
      </ul>

      {canManage && !initial.completedAt ? (
        <button
          onClick={handleComplete}
          disabled={isPending}
          className="mt-3 h-9 w-full rounded-lg border border-border text-xs font-semibold disabled:opacity-60"
        >
          Finalizar checklist
        </button>
      ) : null}
    </div>
  );
}
