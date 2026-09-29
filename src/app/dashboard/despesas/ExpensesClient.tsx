"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatBRL, centsToReais } from "@/lib/money";
import { createExpenseAction, markExpenseAsPaidAction, updateExpenseAction } from "./actions";

export type ExpenseCategory =
  | "ALUGUEL"
  | "SALARIOS"
  | "FORNECEDORES"
  | "IMPOSTOS"
  | "MANUTENCAO_EQUIPAMENTOS"
  | "UTILIDADES"
  | "MARKETING"
  | "OUTROS";

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  ALUGUEL: "Aluguel",
  SALARIOS: "Salários/Pró-labore",
  FORNECEDORES: "Fornecedores/Peças",
  IMPOSTOS: "Impostos",
  MANUTENCAO_EQUIPAMENTOS: "Manutenção de equipamentos",
  UTILIDADES: "Utilidades (água/luz/internet)",
  MARKETING: "Marketing",
  OUTROS: "Outros",
};

const METHOD_LABEL: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "Pix",
  CARTAO: "Cartão",
  OUTRO: "Outro",
};

const STATUS_LABEL: Record<string, string> = {
  PENDENTE: "Pendente",
  PAGA: "Paga",
  ATRASADA: "Atrasada",
};

const STATUS_CLASS: Record<string, string> = {
  PENDENTE: "bg-muted/20 text-muted",
  PAGA: "bg-success/15 text-success",
  ATRASADA: "bg-danger/15 text-danger",
};

export interface ExpenseView {
  id: string;
  category: ExpenseCategory;
  description: string;
  supplierName: string | null;
  amountCents: number;
  dueDate: string;
  paidAt: string | null;
  paymentMethod: string | null;
  notes: string | null;
  status: "PENDENTE" | "PAGA" | "ATRASADA";
}

const inputClass =
  "h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

export function ExpensesClient({ expenses }: { expenses: ExpenseView[] }) {
  const [creating, setCreating] = useState(false);

  const { open, paid } = useMemo(() => {
    const open = expenses.filter((e) => e.status !== "PAGA");
    const paid = expenses.filter((e) => e.status === "PAGA");
    return { open, paid };
  }, [expenses]);

  const openTotalCents = open.reduce((sum, e) => sum + e.amountCents, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-muted">Total em aberto</p>
          <p className="text-lg font-semibold">{formatBRL(openTotalCents)}</p>
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className="h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground active:scale-[0.98]"
        >
          {creating ? "Cancelar" : "+ Nova despesa"}
        </button>
      </div>

      {creating ? (
        <ExpenseForm onDone={() => setCreating(false)} />
      ) : null}

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Em aberto ({open.length})
        </h2>
        {open.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma despesa em aberto.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {open.map((e) => (
              <ExpenseCard key={e.id} expense={e} />
            ))}
          </ul>
        )}
      </section>

      {paid.length > 0 ? (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Pagas ({paid.length})</h2>
          <ul className="flex flex-col gap-3">
            {paid.map((e) => (
              <ExpenseCard key={e.id} expense={e} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ExpenseCard({ expense }: { expense: ExpenseView }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [payMode, setPayMode] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("DINHEIRO");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirmPay() {
    setError(null);
    startTransition(async () => {
      const result = await markExpenseAsPaidAction(expense.id, paymentMethod);
      if (!result.success) {
        setError(result.error ?? "Falha ao marcar como paga.");
        return;
      }
      setPayMode(false);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <li className="rounded-xl border border-border bg-background p-3">
        <ExpenseForm
          expense={expense}
          onDone={() => {
            setEditing(false);
            router.refresh();
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-xs font-medium text-muted">{CATEGORY_LABEL[expense.category]}</span>
          <p className="text-sm font-medium">{expense.description}</p>
          {expense.supplierName ? <p className="text-xs text-muted">{expense.supplierName}</p> : null}
        </div>
        <span className="text-sm font-semibold">{formatBRL(expense.amountCents)}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[expense.status]}`}>
          {STATUS_LABEL[expense.status]}
        </span>
        <span className="text-xs text-muted">
          {expense.status === "PAGA"
            ? `Paga em ${new Date(expense.paidAt!).toLocaleDateString("pt-BR")} · ${METHOD_LABEL[expense.paymentMethod ?? ""] ?? ""}`
            : `Vence em ${new Date(expense.dueDate + "T00:00:00").toLocaleDateString("pt-BR")}`}
        </span>
      </div>
      {expense.notes ? <p className="mt-1 text-xs text-muted">{expense.notes}</p> : null}

      {expense.status !== "PAGA" ? (
        payMode ? (
          <div className="mt-2 flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputClass}>
              {Object.entries(METHOD_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {error ? <p className="text-xs text-danger">{error}</p> : null}
            <div className="flex gap-2">
              <button
                onClick={confirmPay}
                disabled={isPending}
                className="h-9 flex-1 rounded-lg bg-success/15 text-xs font-semibold text-success disabled:opacity-50"
              >
                Confirmar pagamento
              </button>
              <button onClick={() => setPayMode(false)} className="h-9 flex-1 rounded-lg border border-border text-xs">
                Voltar
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => setPayMode(true)}
              className="h-9 flex-1 rounded-lg bg-success/15 text-xs font-semibold text-success"
            >
              Marcar como paga
            </button>
            <button onClick={() => setEditing(true)} className="h-9 flex-1 rounded-lg border border-border text-xs font-medium">
              Editar
            </button>
          </div>
        )
      ) : null}
    </li>
  );
}

function ExpenseForm({
  expense,
  onDone,
  onCancel,
}: {
  expense?: ExpenseView;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? "OUTROS");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [supplierName, setSupplierName] = useState(expense?.supplierName ?? "");
  const [amountReais, setAmountReais] = useState(expense ? centsToReais(expense.amountCents) : "");
  const [dueDate, setDueDate] = useState(expense?.dueDate ?? "");
  const [notes, setNotes] = useState(expense?.notes ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const input = { category, description, supplierName: supplierName || undefined, amountReais, dueDate, notes: notes || undefined };
      const result = expense ? await updateExpenseAction(expense.id, input) : await createExpenseAction(input);
      if (!result.success) {
        setError(result.error ?? "Falha ao salvar.");
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
      <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className={inputClass}>
        {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Descrição"
        className={inputClass}
      />
      <input
        value={supplierName}
        onChange={(e) => setSupplierName(e.target.value)}
        placeholder="Fornecedor (opcional)"
        className={inputClass}
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          inputMode="decimal"
          value={amountReais}
          onChange={(e) => setAmountReais(e.target.value)}
          placeholder="Valor (R$)"
          className={inputClass}
        />
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
      </div>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Observação (opcional)"
        className={inputClass}
      />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={isPending || !description.trim() || !amountReais.trim() || !dueDate}
          className="h-11 flex-1 rounded-xl bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          {isPending ? "Salvando…" : expense ? "Salvar correção" : "Registrar despesa"}
        </button>
        {onCancel ? (
          <button onClick={onCancel} className="h-11 flex-1 rounded-xl border border-border text-sm font-semibold">
            Voltar
          </button>
        ) : null}
      </div>
    </div>
  );
}
