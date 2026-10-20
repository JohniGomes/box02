"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createExecutorAction, setExecutorStatusAction } from "./actions";

interface ExecutorView {
  id: string;
  name: string;
  status: "ATIVO" | "INATIVO";
}

const inputClass =
  "h-12 flex-1 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

export function ExecutorsClient({ executors }: { executors: ExecutorView[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await createExecutorAction(name);
      if (!result.success) {
        setError(result.error ?? "Não foi possível adicionar.");
        return;
      }
      setName("");
      router.refresh();
    });
  }

  function toggle(id: string, next: "ATIVO" | "INATIVO") {
    setError(null);
    startTransition(async () => {
      const result = await setExecutorStatusAction(id, next);
      if (!result.success) {
        setError(result.error ?? "Não foi possível alterar.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome (ex.: Mateus Cintra)"
          className={inputClass}
        />
        <button
          type="button"
          onClick={add}
          disabled={isPending || name.trim().length < 2}
          className="h-12 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          Adicionar
        </button>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}

      {executors.length === 0 ? (
        <p className="text-sm text-muted">Nenhum executor cadastrado.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {executors.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
            >
              <span className={`text-sm font-medium ${e.status === "INATIVO" ? "text-muted line-through" : ""}`}>
                {e.name}
                {e.status === "INATIVO" ? <span className="ml-2 text-xs no-underline">(inativo)</span> : null}
              </span>
              <button
                type="button"
                onClick={() => toggle(e.id, e.status === "ATIVO" ? "INATIVO" : "ATIVO")}
                disabled={isPending}
                className="h-9 rounded-lg border border-border px-3 text-xs font-medium disabled:opacity-50"
              >
                {e.status === "ATIVO" ? "Inativar" : "Reativar"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
