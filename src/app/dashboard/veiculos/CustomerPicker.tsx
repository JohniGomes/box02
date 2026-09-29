"use client";

import { useEffect, useRef, useState } from "react";
import { searchCustomersForPickerAction, type CustomerPickerResult } from "./actions";

export function CustomerPicker({
  value,
  onChange,
  error,
}: {
  value: { id: string; label: string } | null;
  onChange: (customer: { id: string; label: string } | null) => void;
  error?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerPickerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const loadingTimer = setTimeout(() => setLoading(true), 0);
    debounceRef.current = setTimeout(async () => {
      const items = await searchCustomersForPickerAction(query);
      setResults(items);
      setLoading(false);
    }, 300);
    return () => {
      clearTimeout(loadingTimer);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const visibleResults = query.trim().length < 2 ? [] : results;

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3">
        <span className="text-sm font-medium">{value.label}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="shrink-0 text-xs font-medium text-accent"
        >
          Trocar
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar cliente por nome, CPF ou CNPJ…"
        className="h-12 w-full rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
      />
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}

      {open && query.trim().length >= 2 ? (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          {loading ? (
            <p className="px-4 py-3 text-sm text-muted">Buscando…</p>
          ) : visibleResults.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">Nenhum cliente encontrado.</p>
          ) : (
            <ul>
              {visibleResults.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange({ id: c.id, label: c.label });
                      setOpen(false);
                      setQuery("");
                    }}
                    className="block w-full px-4 py-3 text-left text-sm hover:bg-background"
                  >
                    {c.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
