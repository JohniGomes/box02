"use client";

import { useState, useTransition } from "react";
import { createQuickCustomerAction } from "@/app/dashboard/venda-rapida/actions";

const inputClass =
  "h-11 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent";

/**
 * Cadastro mínimo de cliente sem sair da tela: só nome e telefone. Se já
 * existe cliente com esse telefone, reaproveita em vez de duplicar. O resto do
 * cadastro (CPF, endereço…) completa-se depois na aba Clientes.
 */
export function QuickCustomerForm({
  onCreated,
}: {
  onCreated: (customer: { id: string; label: string }, reused: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await createQuickCustomerAction({ name, phone: phone || undefined });
      if (!result.success || !result.customer) {
        setError(result.error ?? "Não foi possível cadastrar o cliente.");
        return;
      }
      if (result.reused) setNotice(`Já existia um cliente com esse telefone (${result.customer.label}) — usei o cadastro dele.`);
      onCreated(result.customer, Boolean(result.reused));
      setName("");
      setPhone("");
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-1">
        {notice ? <p className="text-xs text-muted">{notice}</p> : null}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-10 rounded-lg border border-dashed border-border px-3 text-xs font-semibold text-muted"
      >
        + Cliente novo (só nome e telefone)
      </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">Cliente novo — cadastro rápido</span>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted">
          Fechar
        </button>
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome completo"
        className={inputClass}
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        inputMode="tel"
        placeholder="Telefone / WhatsApp com DDD (opcional)"
        className={inputClass}
      />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <button
        type="button"
        onClick={handleCreate}
        disabled={isPending || name.trim().length < 3}
        className="h-11 rounded-lg bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-50"
      >
        {isPending ? "Cadastrando…" : "Cadastrar e usar"}
      </button>
    </div>
  );
}
