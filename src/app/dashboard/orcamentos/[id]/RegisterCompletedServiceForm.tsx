"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatBRL, reaisToCents } from "@/lib/money";
import { registerCompletedServiceAction } from "../actions";
import { defaultExecutorOptionId } from "@/lib/executors/value";
import { useRememberedChoice } from "@/lib/useRemembered";
import { LastMileageHint } from "@/components/LastMileageHint";

type PaymentMethod = "DINHEIRO" | "PIX" | "CARTAO" | "OUTRO";

const METHOD_LABEL: Record<PaymentMethod, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "Pix",
  CARTAO: "Cartão",
  OUTRO: "Outro",
};

interface PaymentRow {
  key: string;
  method: PaymentMethod;
  amount: string;
}

function newRow(amount = ""): PaymentRow {
  return { key: Math.random().toString(36).slice(2), method: "PIX", amount };
}

function centsToField(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * Para serviço que JÁ aconteceu e foi pago: uma única tela aprova (se
 * preciso), cria a OS, marca tudo como executado e entregue, lança os
 * pagamentos e deixa as datas na data real do serviço.
 */
export function RegisterCompletedServiceForm({
  quoteId,
  totalCents,
  customerName,
  lastMileage,
  executors,
  currentUserId,
}: {
  quoteId: string;
  totalCents: number;
  customerName: string;
  lastMileage?: number | null;
  executors: { id: string; name: string }[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serviceDate, setServiceDate] = useState("");
  const [mileage, setMileage] = useState("");
  // `executors` = opções do seletor (nomes da lista de executores; se estiver
  // vazia, usuários ativos). O valor escolhido é enviado como `executedBy`.
  const [executedBy, setExecutedBy] = useRememberedChoice(
    "box02.lastExecutor",
    defaultExecutorOptionId(executors, currentUserId),
    executors.map((e) => e.id),
  );
  const [deliveryName, setDeliveryName] = useState(customerName);
  const [rows, setRows] = useState<PaymentRow[]>([newRow(centsToField(totalCents))]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const inputClass =
    "h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

  const paidCents = rows.reduce((sum, r) => sum + reaisToCents(r.amount || "0"), 0);
  const remainingCents = totalCents - paidCents;
  const today = new Date().toISOString().slice(0, 10);

  function updateRow(key: string, patch: Partial<PaymentRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const result = await registerCompletedServiceAction(quoteId, {
      serviceDate,
      mileageAtEntry: mileage,
      executedBy,
      deliveryAcceptedName: deliveryName,
      payments: rows
        .filter((r) => reaisToCents(r.amount || "0") > 0)
        .map((r) => ({ method: r.method, amountReais: r.amount })),
    });

    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Não foi possível registrar o serviço.");
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    router.push(`/dashboard/os/${result.workOrderId}/recibo`);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-12 rounded-xl bg-accent text-base font-semibold text-accent-foreground active:scale-[0.98]"
      >
        Registrar serviço já concluído e pago
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <div>
        <h2 className="text-sm font-semibold">Serviço já concluído e pago</h2>
        <p className="mt-1 text-xs text-muted">
          Cria a OS já entregue, com os itens executados e os pagamentos lançados, na data real do serviço.
          Se o orçamento ainda não foi aprovado, ele é aprovado por inteiro automaticamente. Em seguida abre o
          recibo para enviar ao cliente.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="serviceDate">
            Data do serviço
          </label>
          <input
            id="serviceDate"
            type="date"
            max={today}
            value={serviceDate}
            onChange={(e) => setServiceDate(e.target.value)}
            className={inputClass}
          />
          {fieldErrors.serviceDate ? <p className="text-xs text-danger">{fieldErrors.serviceDate}</p> : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="rcsMileage">
            Quilometragem (opcional)
          </label>
          <input
            id="rcsMileage"
            inputMode="numeric"
            value={mileage}
            onChange={(e) => setMileage(e.target.value)}
            placeholder="Ex.: 45000"
            className={inputClass}
          />
          <LastMileageHint lastMileage={lastMileage} current={mileage} onUse={setMileage} />
          {fieldErrors.mileageAtEntry ? <p className="text-xs text-danger">{fieldErrors.mileageAtEntry}</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="rcsExecutor">
            Quem executou
          </label>
          <select
            id="rcsExecutor"
            value={executedBy}
            onChange={(e) => setExecutedBy(e.target.value)}
            className={inputClass}
          >
            {executors.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="rcsDelivery">
            Quem retirou o veículo
          </label>
          <input
            id="rcsDelivery"
            value={deliveryName}
            onChange={(e) => setDeliveryName(e.target.value)}
            className={inputClass}
          />
          {fieldErrors.deliveryAcceptedName ? (
            <p className="text-xs text-danger">{fieldErrors.deliveryAcceptedName}</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Pagamento</span>
        {rows.map((row) => (
          <div key={row.key} className="flex gap-2">
            <select
              value={row.method}
              onChange={(e) => updateRow(row.key, { method: e.target.value as PaymentMethod })}
              className={`${inputClass} w-36`}
            >
              {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABEL[m]}
                </option>
              ))}
            </select>
            <input
              value={row.amount}
              onChange={(e) => updateRow(row.key, { amount: e.target.value })}
              inputMode="decimal"
              placeholder="0,00"
              className={`${inputClass} min-w-0 flex-1`}
            />
            {rows.length > 1 ? (
              <button
                type="button"
                onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                className="px-2 text-xs font-medium text-danger"
              >
                Remover
              </button>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, newRow(remainingCents > 0 ? centsToField(remainingCents) : "")])}
          className="h-10 rounded-xl border border-dashed border-border text-sm font-medium text-muted"
        >
          + Outra forma de pagamento
        </button>
        {fieldErrors.payments ? <p className="text-xs text-danger">{fieldErrors.payments}</p> : null}
      </div>

      <div className="rounded-xl bg-background p-4 text-sm">
        <div className="flex justify-between text-muted">
          <span>Total do serviço</span>
          <span className="text-foreground">{formatBRL(totalCents)}</span>
        </div>
        <div className="flex justify-between text-muted">
          <span>Pago</span>
          <span className="text-foreground">{formatBRL(paidCents)}</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
          <span>{remainingCents < 0 ? "Pago a mais" : "Falta pagar"}</span>
          <span className={remainingCents < 0 ? "text-danger" : ""}>{formatBRL(Math.abs(remainingCents))}</span>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={submitting}
          className="h-12 flex-1 rounded-xl border border-border text-base font-medium"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={
            submitting ||
            !serviceDate ||
            paidCents <= 0 ||
            remainingCents < 0 ||
            deliveryName.trim().length < 2
          }
          className="h-12 flex-1 rounded-xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50"
        >
          {submitting ? "Registrando…" : "Registrar e gerar recibo"}
        </button>
      </div>
    </div>
  );
}
