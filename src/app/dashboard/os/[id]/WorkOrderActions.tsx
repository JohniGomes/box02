"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelWorkOrderAction,
  closeWorkOrderAction,
  setWorkOrderItemStatusAction,
  setWorkOrderStatusAction,
} from "../actions";
import type { WorkOrderStatus } from "@/lib/db/repositories/workOrders";
import { WORK_ORDER_STATUS_LABEL } from "../statusLabels";

const NEXT_STATUS: Partial<Record<WorkOrderStatus, WorkOrderStatus[]>> = {
  ABERTA: ["EM_DIAGNOSTICO", "EM_EXECUCAO"],
  EM_DIAGNOSTICO: ["EM_EXECUCAO"],
  EM_EXECUCAO: ["AGUARDANDO_PECA", "TESTE_FINAL"],
  AGUARDANDO_PECA: ["EM_EXECUCAO"],
  TESTE_FINAL: ["EM_EXECUCAO", "PRONTA"],
};

export function WorkOrderStatusActions({
  workOrderId,
  status,
  receptionAccepted,
}: {
  workOrderId: string;
  status: WorkOrderStatus;
  /** Antecipação de UI (UX-10) — reflete o mesmo dado que o servidor já
   * usa para o gate real (Ciclo F). Nunca recalcula a regra: só lê se o
   * aceite existe ou não, e desabilita/explica antes do clique. A
   * validação definitiva continua exclusivamente no servidor. */
  receptionAccepted: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const options = NEXT_STATUS[status] ?? [];

  if (options.length === 0) return null;

  function go(next: WorkOrderStatus) {
    setError(null);
    startTransition(async () => {
      const result = await setWorkOrderStatusAction(workOrderId, next);
      if (!result.success) {
        setError(result.error ?? "Falha ao mudar status.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const blockedByReception = opt === "EM_EXECUCAO" && !receptionAccepted;
          return (
            <div key={opt} className="flex flex-col gap-1">
              <button
                onClick={() => go(opt)}
                disabled={isPending || blockedByReception}
                className="h-11 rounded-xl border border-border px-4 text-sm font-medium disabled:opacity-60"
              >
                {WORK_ORDER_STATUS_LABEL[opt]}
              </button>
              {blockedByReception ? (
                <p className="max-w-[160px] text-[10px] text-muted">Requer aceite de recepção registrado</p>
              ) : null}
            </div>
          );
        })}
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export function WorkOrderItemActions({
  workOrderId,
  itemId,
}: {
  workOrderId: string;
  itemId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function markExecuted() {
    setError(null);
    startTransition(async () => {
      const result = await setWorkOrderItemStatusAction(workOrderId, itemId, "EXECUTADO");
      if (!result.success) {
        setError(result.error ?? "Falha ao marcar como executado.");
        return;
      }
      router.refresh();
    });
  }

  function confirmCancel() {
    setError(null);
    startTransition(async () => {
      const result = await setWorkOrderItemStatusAction(workOrderId, itemId, "CANCELADO", reason);
      if (!result.success) {
        setError(result.error ?? "Falha ao cancelar item.");
        return;
      }
      setCancelling(false);
      router.refresh();
    });
  }

  if (cancelling) {
    return (
      <div className="flex flex-col gap-2">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo do cancelamento"
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
        />
        <div className="flex gap-2">
          <button
            onClick={confirmCancel}
            disabled={isPending || reason.trim().length < 3}
            className="h-9 flex-1 rounded-lg bg-danger text-xs font-semibold text-white disabled:opacity-50"
          >
            Confirmar
          </button>
          <button onClick={() => setCancelling(false)} className="h-9 flex-1 rounded-lg border border-border text-xs">
            Voltar
          </button>
        </div>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <button
          onClick={markExecuted}
          disabled={isPending}
          className="h-9 flex-1 rounded-lg bg-success/15 text-xs font-semibold text-success disabled:opacity-60"
        >
          Executado
        </button>
        <button
          onClick={() => setCancelling(true)}
          disabled={isPending}
          className="h-9 flex-1 rounded-lg border border-danger/40 text-xs font-semibold text-danger disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export function CloseWorkOrderForm({
  workOrderId,
  deliveryChecklistPendingCount,
}: {
  workOrderId: string;
  /** Antecipação de UI (UX-10) — mesma lógica de `WorkOrderStatusActions`:
   * lê o dado já calculado (itens obrigatórios pendentes no checklist de
   * entrega, se uma instância existir), nunca recalcula a regra do
   * servidor. 0 = sem pendência conhecida (pode não haver checklist
   * nenhum, o que também é 0 — ausência nunca bloqueia, EX-2). */
  deliveryChecklistPendingCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [document, setDocumentValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const blocked = deliveryChecklistPendingCount > 0;

  function handleClose() {
    setError(null);
    startTransition(async () => {
      const result = await closeWorkOrderAction(workOrderId, {
        deliveryAcceptedName: name,
        deliveryAcceptedDocument: document || undefined,
      });
      if (!result.success) {
        setError(result.error ?? "Falha ao fechar a OS.");
        return;
      }
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-1">
        <button
          onClick={() => setOpen(true)}
          disabled={blocked}
          className="h-12 rounded-xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50"
        >
          Fechar OS (entregar ao cliente)
        </button>
        {blocked ? (
          <p className="text-xs text-danger">
            {deliveryChecklistPendingCount} item(ns) obrigatório(s) pendente(s) no checklist de entrega
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <p className="text-sm font-semibold">Aceite na entrega</p>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Nome de quem está recebendo</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-12 rounded-xl border border-border bg-background px-4 text-base"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">CPF (opcional)</label>
        <input
          value={document}
          onChange={(e) => setDocumentValue(e.target.value)}
          inputMode="numeric"
          className="h-12 rounded-xl border border-border bg-background px-4 text-base"
          placeholder="000.000.000-00"
        />
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <button
          onClick={handleClose}
          disabled={isPending || name.trim().length < 2}
          className="h-11 flex-1 rounded-xl bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          {isPending ? "Fechando…" : "Confirmar entrega"}
        </button>
        <button onClick={() => setOpen(false)} className="h-11 flex-1 rounded-xl border border-border text-sm">
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function CancelWorkOrderForm({ workOrderId }: { workOrderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelWorkOrderAction(workOrderId, reason);
      if (!result.success) {
        setError(result.error ?? "Falha ao cancelar.");
        return;
      }
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="h-11 rounded-xl border border-danger/40 text-sm font-medium text-danger">
        Cancelar OS
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-danger/30 bg-danger/5 p-4">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo do cancelamento"
        className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
      />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <button
          onClick={handleCancel}
          disabled={isPending || reason.trim().length < 3}
          className="h-10 flex-1 rounded-lg bg-danger text-sm font-semibold text-white disabled:opacity-50"
        >
          Confirmar
        </button>
        <button onClick={() => setOpen(false)} className="h-10 flex-1 rounded-lg border border-border text-sm">
          Voltar
        </button>
      </div>
    </div>
  );
}
