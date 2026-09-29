"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "RASCUNHO", label: "Rascunho" },
  { value: "ENVIADO", label: "Enviado" },
  { value: "APROVADO", label: "Aprovado" },
  { value: "APROVADO_PARCIAL", label: "Parcial" },
  { value: "RECUSADO", label: "Recusado" },
  { value: "EXPIRADO", label: "Expirado" },
  { value: "CANCELADO", label: "Cancelado" },
];

export function QuoteSearchBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentStatus = searchParams.get("status") ?? "";

  function pushParams(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pushParams({ q: query });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por número, cliente ou placa…"
        className="h-12 w-full rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
      />
      <div className="flex flex-wrap gap-2 overflow-x-auto">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => pushParams({ status: opt.value })}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
              currentStatus === opt.value
                ? "border-accent bg-accent/15 text-foreground"
                : "border-border text-muted"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
