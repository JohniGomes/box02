"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  completeWorkOrderChecklistAction,
  setWorkOrderChecklistItemStatusAction,
  startWorkOrderChecklistAction,
} from "../checklistActions";

export type WorkOrderChecklistItemStatusValue = "OK" | "ATENCAO" | "NA" | null;

export interface WorkOrderChecklistItemView {
  id: string;
  description: string;
  required: boolean;
  checked: boolean;
  status: WorkOrderChecklistItemStatusValue;
  observacao: string | null;
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

const STATUS_OPTIONS: { value: "OK" | "ATENCAO" | "NA"; label: string }[] = [
  { value: "OK", label: "OK" },
  { value: "ATENCAO", label: "Atenção" },
  { value: "NA", label: "N/A" },
];

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
  const [observacaoDrafts, setObservacaoDrafts] = useState<Record<string, string>>({});

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

  function handleSetStatus(itemId: string, status: "OK" | "ATENCAO" | "NA", observacao: string | undefined) {
    if (!initial) return;
    // Clicar de novo no status já selecionado desfaz (volta a pendente).
    const item = initial.items.find((i) => i.id === itemId);
    const nextStatus = item?.status === status ? null : status;
    startTransition(async () => {
      await setWorkOrderChecklistItemStatusAction(workOrderId, initial.id, itemId, nextStatus, observacao);
      router.refresh();
    });
  }

  function handleBlurObservacao(itemId: string) {
    if (!initial) return;
    const item = initial.items.find((i) => i.id === itemId);
    if (!item?.status) return;
    const draft = observacaoDrafts[itemId];
    if (draft === undefined || draft === (item.observacao ?? "")) return;
    startTransition(async () => {
      await setWorkOrderChecklistItemStatusAction(workOrderId, initial.id, itemId, item.status, draft);
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

      <ul className="flex flex-col gap-3">
        {initial.items.map((item) => {
          const canEdit = canManage && !initial.completedAt && !isPending;
          return (
            <li key={item.id} className="flex flex-col gap-1.5">
              <span className="text-sm">
                {item.description}
                {item.required ? <span className="ml-1 text-[10px] text-danger">obrigatório</span> : null}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => handleSetStatus(item.id, opt.value, observacaoDrafts[item.id] ?? item.observacao ?? undefined)}
                    className={`h-8 rounded-lg border px-3 text-xs font-semibold disabled:opacity-60 ${
                      item.status === opt.value
                        ? opt.value === "OK"
                          ? "border-success bg-success/15 text-success"
                          : opt.value === "ATENCAO"
                            ? "border-accent bg-accent/15 text-accent"
                            : "border-muted bg-muted/20 text-muted"
                        : "border-border text-muted"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {item.status ? (
                <input
                  value={observacaoDrafts[item.id] ?? item.observacao ?? ""}
                  onChange={(e) => setObservacaoDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  onBlur={() => handleBlurObservacao(item.id)}
                  disabled={!canEdit}
                  placeholder="Observação (opcional)"
                  className="h-9 rounded-lg border border-border bg-surface px-3 text-xs outline-none focus:border-accent disabled:opacity-60"
                />
              ) : null}
            </li>
          );
        })}
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
