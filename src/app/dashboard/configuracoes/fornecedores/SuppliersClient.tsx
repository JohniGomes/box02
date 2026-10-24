"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatPhone, whatsappLink } from "@/lib/validation/phone";
import { createSupplierAction, setSupplierStatusAction, updateSupplierAction } from "./actions";

interface SupplierView {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  status: "ATIVO" | "INATIVO";
}

const inputClass =
  "h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

function SupplierForm({
  supplier,
  onDone,
  onCancel,
}: {
  supplier?: SupplierView;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(supplier?.name ?? "");
  const [phone, setPhone] = useState(supplier?.phone ? formatPhone(supplier.phone) : "");
  const [notes, setNotes] = useState(supplier?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const input = { name, phone: phone || undefined, notes: notes || undefined };
      const result = supplier ? await updateSupplierAction(supplier.id, input) : await createSupplierAction(input);
      if (!result.success) {
        setError(result.error ?? "Não foi possível salvar.");
        return;
      }
      if (!supplier) {
        setName("");
        setPhone("");
        setNotes("");
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do fornecedor" className={inputClass} />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        inputMode="tel"
        placeholder="Telefone / WhatsApp com DDD (opcional)"
        className={inputClass}
      />
      <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observação (opcional) — ex.: o que vende" className={inputClass} />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={isPending || name.trim().length < 2}
          className="h-10 flex-1 rounded-xl bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          {isPending ? "Salvando…" : supplier ? "Salvar" : "Cadastrar fornecedor"}
        </button>
        {onCancel ? (
          <button onClick={onCancel} className="h-10 flex-1 rounded-xl border border-border text-sm">
            Voltar
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SupplierCard({ supplier }: { supplier: SupplierView }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await setSupplierStatusAction(supplier.id, supplier.status === "ATIVO" ? "INATIVO" : "ATIVO");
      if (!result.success) {
        setError(result.error ?? "Não foi possível alterar.");
        return;
      }
      router.refresh();
    });
  }

  if (editing) {
    return (
      <li>
        <SupplierForm supplier={supplier} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={`text-sm font-semibold ${supplier.status === "INATIVO" ? "text-muted line-through" : ""}`}>{supplier.name}</p>
          {supplier.phone ? <p className="text-xs text-muted">{formatPhone(supplier.phone)}</p> : null}
          {supplier.notes ? <p className="text-xs text-muted">{supplier.notes}</p> : null}
        </div>
        {supplier.status === "INATIVO" ? (
          <span className="shrink-0 rounded-full bg-muted/20 px-2 py-0.5 text-[11px] font-semibold text-muted">Inativo</span>
        ) : null}
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="mt-1 flex flex-wrap gap-2">
        <button onClick={() => setEditing(true)} className="h-8 rounded-lg border border-border px-3 text-xs font-medium">
          Editar
        </button>
        {supplier.phone ? (
          <a
            href={whatsappLink(supplier.phone)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium"
          >
            Chamar no WhatsApp
          </a>
        ) : null}
        <button onClick={toggle} disabled={isPending} className="h-8 rounded-lg border border-border px-3 text-xs font-medium disabled:opacity-50">
          {supplier.status === "ATIVO" ? "Inativar" : "Reativar"}
        </button>
      </div>
    </li>
  );
}

export function SuppliersClient({ suppliers }: { suppliers: SupplierView[] }) {
  const [creating, setCreating] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      {creating ? (
        <SupplierForm onDone={() => setCreating(false)} onCancel={() => setCreating(false)} />
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="h-11 rounded-xl bg-accent text-sm font-semibold text-accent-foreground active:scale-[0.98]"
        >
          + Novo fornecedor
        </button>
      )}
      {suppliers.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-5 text-center text-sm text-muted">Nenhum fornecedor cadastrado ainda.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {suppliers.map((s) => (
            <SupplierCard key={s.id} supplier={s} />
          ))}
        </ul>
      )}
    </div>
  );
}
