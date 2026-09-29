"use client";

import { useEffect, useRef, useState } from "react";
import { searchActiveServicesForPickerAction, type ServicePickerOption } from "@/app/dashboard/configuracoes/servicos/actions";

/**
 * Botão que abre uma busca inline de serviços ATIVOS da Biblioteca. Ao
 * selecionar, chama `onSelect` com os dados do serviço — quem usa este
 * componente decide o que fazer com isso (normalmente: preencher os
 * campos de descrição/preço JÁ EXISTENTES no formulário, que continuam
 * 100% editáveis depois). Este componente nunca grava nada sozinho —
 * é só conveniência de preenchimento, a validação real (serviço
 * precisa estar ATIVO) acontece no servidor quando o item é salvo.
 */
export function ServicePickerButton({ onSelect }: { onSelect: (service: ServicePickerOption) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ServicePickerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const loadingTimer = setTimeout(() => setLoading(true), 0);
    debounceRef.current = setTimeout(async () => {
      const items = await searchActiveServicesForPickerAction(query);
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
        Selecionar do catálogo
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">Catálogo de serviços</span>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted">
          Fechar
        </button>
      </div>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nome ou categoria…"
        className="h-11 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
      />
      {loading ? (
        <p className="py-2 text-center text-xs text-muted">Buscando…</p>
      ) : results.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted">
          {query.trim() ? "Nenhum serviço ativo encontrado." : "Digite para buscar, ou role a lista completa."}
        </p>
      ) : (
        <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
          {results.map((service) => (
            <li key={service.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(service);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-surface active:scale-[0.99]"
              >
                <span>
                  {service.label}
                  {service.category ? <span className="text-muted"> · {service.category}</span> : null}
                </span>
                <span className="shrink-0 text-right text-xs text-muted">
                  {service.suggestedPriceReais ? (
                    <>
                      R$ {service.suggestedPriceReais}
                      <br />
                      <span className="text-[10px]">
                        {service.suggestedPriceSource === "manual" ? "definido manualmente" : "custo + markup"}
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
