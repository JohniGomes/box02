"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelWorkOrderAction,
  reactivateWorkOrderAction,
  closeWorkOrderAction,
  correctWorkOrderItemExecutorAction,
  executeItemWithStockEntryAction,
  getItemStockEntryDefaultsAction,
  markAllPlannedExecutedAction,
  setWorkOrderItemStatusAction,
  setWorkOrderStatusAction,
  undoWorkOrderItemExecutionAction,
} from "../actions";
import type { StockEntryDefaults } from "@/lib/workOrders/stockEntry";
import { defaultExecutorOptionId, sanitizeExecutorValue, selectedFromNames } from "@/lib/executors/value";
import { ExecutorPicker } from "@/components/ExecutorPicker";
import { useRememberedChoice } from "@/lib/useRemembered";
import {
  PurchasePaymentFields,
  defaultQuickPayment,
  quickPaymentToInput,
  quickPaymentIsValid,
  type QuickPayment,
} from "@/components/PurchasePaymentFields";
import type { WorkOrderStatus } from "@/lib/db/repositories/workOrders";
import { WORK_ORDER_STATUS_LABEL } from "../statusLabels";

const NEXT_STATUS: Partial<Record<WorkOrderStatus, WorkOrderStatus[]>> = {
  ABERTA: ["EM_DIAGNOSTICO", "EM_EXECUCAO"],
  EM_DIAGNOSTICO: ["EM_EXECUCAO"],
  EM_EXECUCAO: ["AGUARDANDO_PECA", "TESTE_FINAL", "PRONTA"],
  AGUARDANDO_PECA: ["EM_EXECUCAO", "PRONTA"],
  TESTE_FINAL: ["EM_EXECUCAO", "PRONTA"],
  PRONTA: ["EM_EXECUCAO"],
};

/** Modo simples: Em execução → Pronta (sem etapas no meio); a entrega fica no botão de fechar a OS. */
const NEXT_STATUS_SIMPLE: Partial<Record<WorkOrderStatus, WorkOrderStatus[]>> = {
  ABERTA: ["EM_EXECUCAO"],
  EM_DIAGNOSTICO: ["EM_EXECUCAO"],
  EM_EXECUCAO: ["PRONTA"],
  AGUARDANDO_PECA: ["EM_EXECUCAO", "PRONTA"],
  TESTE_FINAL: ["EM_EXECUCAO", "PRONTA"],
  PRONTA: ["EM_EXECUCAO"],
};

/** Texto do botão de cada passo (em vez do nome cru do status). */
function statusButtonLabel(from: WorkOrderStatus, to: WorkOrderStatus): string {
  if (to === "PRONTA") return "Marcar como Pronta";
  if (from === "PRONTA" && to === "EM_EXECUCAO") return "Voltar para Em execução";
  return WORK_ORDER_STATUS_LABEL[to];
}

export function WorkOrderStatusActions({
  workOrderId,
  status,
  receptionAccepted,
  receptionRequired = true,
  detailedStages = false,
}: {
  workOrderId: string;
  status: WorkOrderStatus;
  /** Regra em Configurações → Regras: ligada = todas as etapas; desligada (padrão) = modo simples. */
  detailedStages?: boolean;
  /** Antecipação de UI (UX-10) — reflete o mesmo dado que o servidor já
   * usa para o gate real (Ciclo F). Nunca recalcula a regra: só lê se o
   * aceite existe ou não, e desabilita/explica antes do clique. A
   * validação definitiva continua exclusivamente no servidor. */
  receptionAccepted: boolean;
  /** Regra ligada/desligada em Configurações → Regras (padrão: ligada). */
  receptionRequired?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const options = (detailedStages ? NEXT_STATUS : NEXT_STATUS_SIMPLE)[status] ?? [];

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
          const receptionMissing = opt === "EM_EXECUCAO" && !receptionAccepted;
          const blockedByReception = receptionMissing && receptionRequired;
          return (
            <div key={opt} className="flex flex-col gap-1">
              <button
                onClick={() => go(opt)}
                disabled={isPending || blockedByReception}
                className="h-11 rounded-xl border border-border px-4 text-sm font-medium disabled:opacity-60"
              >
                {statusButtonLabel(status, opt)}
              </button>
              {blockedByReception ? (
                <p className="max-w-[160px] text-[10px] text-muted">Requer aceite de recepção registrado</p>
              ) : receptionMissing ? (
                <p className="max-w-[160px] text-[10px] text-muted">
                  Termo de Recepção pendente — pode registrar depois
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export interface ActiveUserOption {
  id: string;
  name: string;
}

export function WorkOrderItemActions({
  workOrderId,
  itemId,
  users,
  currentUserId,
}: {
  workOrderId: string;
  itemId: string;
  /** Ciclo L: quem pode ser registrado como executor — só usuários ativos. */
  users: ActiveUserOption[];
  /** Pré-seleciona o seletor com quem está logado, mas nunca é assumido
   * implicitamente — a escolha sempre é enviada de forma explícita. */
  currentUserId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const defaultExecutor = defaultExecutorOptionId(users, currentUserId);
  const [executorChoice, setExecutorId] = useRememberedChoice("box02.lastExecutor", defaultExecutor);
  const executorId = sanitizeExecutorValue(executorChoice, users, defaultExecutor);
  const [error, setError] = useState<string | null>(null);
  // Falta de estoque: em vez de só travar, oferece dar a entrada e executar.
  const [shortage, setShortage] = useState<StockEntryDefaults | null>(null);
  const [entryQty, setEntryQty] = useState("");
  const [entryCost, setEntryCost] = useState("");
  const [entryPayment, setEntryPayment] = useState<QuickPayment>(defaultQuickPayment());

  function markExecuted() {
    setError(null);
    startTransition(async () => {
      const result = await setWorkOrderItemStatusAction(workOrderId, itemId, "EXECUTADO", {
        executedBy: executorId,
      });
      if (!result.success) {
        if (result.stockShortage) {
          const info = await getItemStockEntryDefaultsAction(workOrderId, itemId);
          if (info.success && info.defaults) {
            setShortage(info.defaults);
            setEntryQty(String(Math.max(1, info.defaults.shortage)));
            setEntryCost(info.defaults.costReais ?? "");
            return;
          }
        }
        setError(result.error ?? "Falha ao marcar como executado.");
        return;
      }
      router.refresh();
    });
  }

  function confirmEntryAndExecute() {
    setError(null);
    startTransition(async () => {
      const result = await executeItemWithStockEntryAction(workOrderId, itemId, {
        executedBy: executorId,
        entryQuantity: entryQty,
        unitCostReais: entryCost || undefined,
        payment: quickPaymentToInput(entryPayment),
      });
      if (!result.success) {
        setError(result.error ?? "Falha ao dar entrada e executar.");
        return;
      }
      setShortage(null);
      router.refresh();
    });
  }

  function confirmCancel() {
    setError(null);
    startTransition(async () => {
      const result = await setWorkOrderItemStatusAction(workOrderId, itemId, "CANCELADO", {
        cancelReason: reason,
      });
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

  if (shortage) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-accent/40 bg-accent/5 p-3">
        <p className="text-xs">
          <strong>{shortage.partName}</strong>: tem {shortage.available} {shortage.unit} em estoque e este item precisa de{" "}
          {shortage.needed}. Dê a entrada do que chegou para executar — a baixa fecha o saldo.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-muted">Entrou quantas?</label>
            <input
              value={entryQty}
              onChange={(e) => setEntryQty(e.target.value)}
              inputMode="numeric"
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted">Custo de cada (R$)</label>
            <input
              value={entryCost}
              onChange={(e) => setEntryCost(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
            />
          </div>
        </div>
        <p className="text-[11px] text-muted">
          Se o custo mudou, ele passa a ser o novo custo da peça. A entrada fica no histórico da peça.
        </p>
        <PurchasePaymentFields value={entryPayment} onChange={setEntryPayment} />
        <div className="flex gap-2">
          <button
            onClick={confirmEntryAndExecute}
            disabled={isPending || !entryQty.trim() || !quickPaymentIsValid(entryPayment)}
            className="h-9 flex-1 rounded-lg bg-success/15 text-xs font-semibold text-success disabled:opacity-60"
          >
            Dar entrada e executar
          </button>
          <button onClick={() => setShortage(null)} className="h-9 flex-1 rounded-lg border border-border text-xs">
            Voltar
          </button>
        </div>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ExecutorPicker options={users} value={executorId} onChange={setExecutorId} />
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

/** Seletor de "quem executou" — reutilizado tanto ao marcar um item como
 * executado quanto ao corrigir o executor depois. */
/** Ciclo L — exibe quem executou um item já EXECUTADO, com opção de
 * corrigir (campo editável, não write-once — DEC de governança 3.5).
 * Reaproveitado tanto pelos itens do orçamento/OS quanto pelos adicionais. */
export function WorkOrderItemExecutorInfo({
  workOrderId,
  itemId,
  executedByUserId,
  executedByName,
  users,
  canManage,
}: {
  workOrderId: string;
  itemId: string;
  executedByUserId: string | null;
  /** Nome escolhido na lista de executores (tem prioridade sobre o usuário). */
  executedByName?: string | null;
  /** Opções do seletor (executores da lista, ou usuários se a lista estiver vazia). */
  users: ActiveUserOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [correcting, setCorrecting] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [undoReason, setUndoReason] = useState("");
  const [newExecutorId, setNewExecutorId] = useState(
    selectedFromNames(users, executedByName) || defaultExecutorOptionId(users, executedByUserId ?? ""),
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const executorName =
    executedByName ?? users.find((u) => u.id === executedByUserId)?.name ?? (executedByUserId ? "(usuário)" : "—");

  function confirmCorrection() {
    setError(null);
    startTransition(async () => {
      const result = await correctWorkOrderItemExecutorAction(workOrderId, itemId, newExecutorId);
      if (!result.success) {
        setError(result.error ?? "Falha ao corrigir executor.");
        return;
      }
      setCorrecting(false);
      router.refresh();
    });
  }

  function confirmUndo() {
    setError(null);
    startTransition(async () => {
      const result = await undoWorkOrderItemExecutionAction(workOrderId, itemId, undoReason);
      if (!result.success) {
        setError(result.error ?? "Falha ao desfazer a execução.");
        return;
      }
      setUndoing(false);
      setUndoReason("");
      router.refresh();
    });
  }

  if (undoing) {
    return (
      <div className="mt-1 flex flex-col gap-1.5">
        <p className="text-[11px] text-muted">
          O item volta para &quot;Planejado&quot;. Se ele deu baixa de peça no estoque, a peça volta. Fica no histórico.
        </p>
        <input
          value={undoReason}
          onChange={(e) => setUndoReason(e.target.value)}
          placeholder="Motivo (ex.: marquei o item errado)"
          className="h-9 rounded-lg border border-border bg-background px-3 text-xs"
        />
        <div className="flex gap-2">
          <button
            onClick={confirmUndo}
            disabled={isPending || undoReason.trim().length < 3}
            className="h-8 flex-1 rounded-lg bg-danger text-[11px] font-semibold text-white disabled:opacity-50"
          >
            Desfazer execução
          </button>
          <button onClick={() => setUndoing(false)} className="h-8 flex-1 rounded-lg border border-border text-[11px]">
            Voltar
          </button>
        </div>
        {error ? <p className="text-[11px] text-danger">{error}</p> : null}
      </div>
    );
  }

  if (correcting) {
    return (
      <div className="mt-1 flex flex-col gap-1.5">
        <ExecutorPicker options={users} value={newExecutorId} onChange={setNewExecutorId} />
        <div className="flex gap-2">
          <button
            onClick={confirmCorrection}
            disabled={isPending}
            className="h-8 flex-1 rounded-lg bg-accent text-[11px] font-semibold text-accent-foreground disabled:opacity-50"
          >
            Confirmar correção
          </button>
          <button onClick={() => setCorrecting(false)} className="h-8 flex-1 rounded-lg border border-border text-[11px]">
            Voltar
          </button>
        </div>
        {error ? <p className="text-[11px] text-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
      <span>Executado por: {executorName}</span>
      {canManage ? (
        <>
          <button onClick={() => setCorrecting(true)} className="font-medium text-accent">
            Corrigir
          </button>
          <button onClick={() => setUndoing(true)} className="font-medium text-danger">
            Desfazer execução
          </button>
        </>
      ) : null}
    </div>
  );
}

/**
 * Atalho ao entregar: marca de uma vez todos os itens ainda "planejados" como executados, com os
 * executores escolhidos. Item a item, igual ao botão de cada item: se algum parar (por exemplo, falta
 * de peça no estoque), os outros seguem e a tela mostra o que ficou.
 */
export function MarkAllExecutedButton({
  workOrderId,
  plannedCount,
  users,
  currentUserId,
}: {
  workOrderId: string;
  plannedCount: number;
  users: ActiveUserOption[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const defaultExecutor = defaultExecutorOptionId(users, currentUserId);
  const [executorChoice, setExecutorId] = useRememberedChoice("box02.lastExecutor", defaultExecutor);
  const executorId = sanitizeExecutorValue(executorChoice, users, defaultExecutor);
  const [message, setMessage] = useState<string | null>(null);

  function run() {
    setMessage(null);
    startTransition(async () => {
      const result = await markAllPlannedExecutedAction(workOrderId, executorId);
      setMessage(result.error ?? null);
      if (result.success || result.done) router.refresh();
      if (result.success) setOpen(false);
    });
  }

  if (plannedCount === 0) return null;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="h-11 rounded-xl border border-border text-sm font-medium">
        Marcar todos os {plannedCount} itens planejados como executados
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
      <p className="text-sm font-semibold">Marcar {plannedCount} item(ns) como executados</p>
      <p className="text-xs text-muted">
        Cada peça dá baixa no estoque, como no botão de cada item. Se faltar peça em algum, ele fica de fora e você resolve depois.
      </p>
      <ExecutorPicker options={users} value={executorId} onChange={setExecutorId} />
      {message ? <p className="rounded-lg bg-accent/10 p-2 text-xs">{message}</p> : null}
      <div className="flex gap-2">
        <button
          onClick={run}
          disabled={isPending}
          className="h-10 flex-1 rounded-xl bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          {isPending ? "Marcando…" : "Marcar todos"}
        </button>
        <button onClick={() => setOpen(false)} className="h-10 flex-1 rounded-xl border border-border text-sm">
          Voltar
        </button>
      </div>
    </div>
  );
}

export function CloseWorkOrderForm({
  workOrderId,
  deliveryChecklistPendingCount,
  deliveryChecklistRequired = true,
  customerName = "",
  customerDocument = "",
}: {
  workOrderId: string;
  /** Regra ligada/desligada em Configurações → Regras (padrão: ligada). */
  deliveryChecklistRequired?: boolean;
  /** Antecipação de UI (UX-10) — mesma lógica de `WorkOrderStatusActions`:
   * lê o dado já calculado (itens obrigatórios pendentes no checklist de
   * entrega, se uma instância existir), nunca recalcula a regra do
   * servidor. 0 = sem pendência conhecida (pode não haver checklist
   * nenhum, o que também é 0 — ausência nunca bloqueia, EX-2). */
  deliveryChecklistPendingCount: number;
  /** Cliente da OS: já vem como quem retira (editável). */
  customerName?: string;
  customerDocument?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(customerName);
  const [document, setDocumentValue] = useState(customerDocument);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const hasPending = deliveryChecklistPendingCount > 0;
  const blocked = hasPending && deliveryChecklistRequired;

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
        ) : hasPending ? (
          <p className="text-xs text-muted">
            {deliveryChecklistPendingCount} item(ns) do checklist de entrega ainda pendente(s) — pode entregar e
            registrar depois (fica em Pendências).
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

export function CancelWorkOrderForm({
  workOrderId,
  returnableParts = [],
}: {
  workOrderId: string;
  /** Peças que já saíram do estoque nesta OS e podem voltar. */
  returnableParts?: { itemId: string; description: string; quantity: number }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  // Padrão "Sim": é o que deixa o saldo certo; a pessoa pode responder Não (ex.: a peça foi usada/perdida).
  const [returnParts, setReturnParts] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelWorkOrderAction(workOrderId, reason, returnableParts.length > 0 ? returnParts : undefined);
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
      {returnableParts.length > 0 ? (
        <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-background p-3 text-sm">
          <p className="font-medium">Devolver as peças ao estoque?</p>
          <ul className="text-xs text-muted">
            {returnableParts.map((p) => (
              <li key={p.itemId}>
                {p.quantity} × {p.description}
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2">
            <input type="radio" checked={returnParts} onChange={() => setReturnParts(true)} />
            <span>Sim, devolver (o estoque volta ao que era)</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={!returnParts} onChange={() => setReturnParts(false)} />
            <span>Não, as peças não voltam ao estoque</span>
          </label>
        </div>
      ) : null}
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

/** Desfaz um cancelamento feito por engano (volta ao status anterior). */
export function ReactivateWorkOrderForm({ workOrderId }: { workOrderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleReactivate() {
    setError(null);
    startTransition(async () => {
      const result = await reactivateWorkOrderAction(workOrderId, reason);
      if (!result.success) {
        setError(result.error ?? "Falha ao reativar.");
        return;
      }
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="h-11 rounded-xl border border-border text-sm font-medium">
        Reativar OS (cancelada por engano)
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-4">
      <p className="text-xs text-muted">
        A OS volta para o status em que estava antes de ser cancelada. Se as peças tinham sido devolvidas ao estoque, elas voltam a sair
        (se faltar saldo, a saída acontece mesmo assim e o estoque pode ficar negativo).
      </p>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo da reativação"
        className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
      />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <button
          onClick={handleReactivate}
          disabled={isPending || reason.trim().length < 3}
          className="h-10 flex-1 rounded-lg bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          {isPending ? "Reativando…" : "Confirmar"}
        </button>
        <button onClick={() => setOpen(false)} className="h-10 flex-1 rounded-lg border border-border text-sm">
          Voltar
        </button>
      </div>
    </div>
  );
}
