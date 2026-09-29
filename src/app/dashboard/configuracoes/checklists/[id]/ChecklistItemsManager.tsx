"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addChecklistItemAction, removeChecklistItemAction, updateChecklistItemAction } from "../actions";

export interface ChecklistItemView {
  id: string;
  description: string;
  required: boolean;
  sortOrder: number;
}

export function ChecklistItemsManager({ checklistId, items }: { checklistId: string; items: ChecklistItemView[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [newDescription, setNewDescription] = useState("");
  const [newRequired, setNewRequired] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const result = await addChecklistItemAction(checklistId, {
        description: newDescription,
        required: newRequired,
        sortOrder: items.length,
      });
      if (!result.success) {
        setError(result.error ?? "Falha ao adicionar.");
        return;
      }
      setNewDescription("");
      setNewRequired(true);
      setAdding(false);
      router.refresh();
    });
  }

  function handleToggleRequired(item: ChecklistItemView) {
    startTransition(async () => {
      await updateChecklistItemAction(checklistId, item.id, {
        description: item.description,
        required: !item.required,
        sortOrder: item.sortOrder,
      });
      router.refresh();
    });
  }

  function handleRemove(itemId: string) {
    startTransition(async () => {
      await removeChecklistItemAction(checklistId, itemId);
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Itens ({items.length})</h2>
        <button onClick={() => setAdding((v) => !v)} className="text-xs font-medium text-accent">
          {adding ? "Cancelar" : "+ Adicionar item"}
        </button>
      </div>

      {adding ? (
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
          <input
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Descrição do item"
            className="h-11 rounded-lg border border-border bg-surface px-3 text-sm"
          />
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={newRequired} onChange={(e) => setNewRequired(e.target.checked)} />
            Obrigatório
          </label>
          {error ? <p className="text-xs text-danger">{error}</p> : null}
          <button
            onClick={handleAdd}
            disabled={isPending || !newDescription.trim()}
            className="h-10 rounded-lg bg-accent text-xs font-semibold text-accent-foreground disabled:opacity-50"
          >
            Adicionar
          </button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="text-sm text-muted">Nenhum item ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background p-3 text-sm">
              <div>
                <p>{item.description}</p>
                <button onClick={() => handleToggleRequired(item)} className="text-xs text-muted underline">
                  {item.required ? "Obrigatório" : "Opcional"} — trocar
                </button>
              </div>
              <button onClick={() => handleRemove(item.id)} className="text-xs font-medium text-danger">
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
