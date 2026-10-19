"use client";

import { useEffect, useRef, useState } from "react";
import { searchActivePartsForPickerAction, type PartPickerOption } from "@/app/dashboard/estoque/actions";

/**
 * Mesmo padrão de `ServicePickerButton`, para peças do estoque. Ao
 * selecionar, chama `onSelect` com os dados da peça — description/preço
 * ficam 100% editáveis depois. Nunca grava nada sozinho; a peça
 * precisar estar ATIVA é revalidado no servidor quando o item é salvo.
 */
export function PartPickerButton({ onSelect }: { onSelect: (part: PartPickerOption) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PartPickerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const loadingTimer = setTimeout(() => setLoading(true), 0);
    debounceRef.current = setTimeout(async () => {
      const items = await searchActivePartsForPickerAction(query);
      setResults(items);
      setLoading(false);
    }, 250);
    return () => {
      clearTimeout(loadingTimer);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-10 rounded-lg border border-accent/40 px-3 text-xs font-semibold text-accent"
      >
        Selecionar do estoque
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">Peças em estoque</span>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted">
          Fechar
        </button>
      </div>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nome ou SKU…"
        className="h-11 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
      />
      {loading ? (
        <p className="py-2 text-center text-xs text-muted">Buscando…</p>
      ) : results.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted">
          {query.trim() ? "Nenhuma peça ativa encontrada." : "Digite para buscar, ou role a lista completa."}
        </p>
      ) : (
        <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
          {results.map((part) => (
            <li key={part.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(part);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-surface active:scale-[0.99]"
              >
                <span>
                  {part.label}
                  <span className="text-muted"> · estoque: {part.currentStock}</span>
                </span>
                <span className="shrink-0 text-right text-xs text-muted">
                  {part.suggestedPriceReais ? (
                    <>
                      R$ {part.suggestedPriceReais}
                      <br />
                      <span className="text-[10px]">
                        {part.suggestedPriceSource === "peça" ? "markup da peça" : "markup padrão"}
                      </span>
                    </>
                  ) : (
                    "sem sugestão"
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted">
        Descrição e valor ficam editáveis depois de selecionar — ou continue com &quot;Item personalizado&quot;.
      </p>
    </div>
  );
}
