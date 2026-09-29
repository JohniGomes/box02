"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export function CustomerSearchBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentType = searchParams.get("type") ?? "";
  const currentStatus = searchParams.get("status") ?? "ATIVO";

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
        placeholder="Buscar por nome, CPF/CNPJ, telefone ou e-mail…"
        className="h-12 w-full rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
      />

      <div className="flex flex-wrap gap-2">
        <SegmentedControl
          value={currentType}
          onChange={(v) => pushParams({ type: v })}
          options={[
            { value: "", label: "Todos" },
            { value: "PF", label: "Pessoa física" },
            { value: "PJ", label: "Pessoa jurídica" },
          ]}
        />
        <SegmentedControl
          value={currentStatus}
          onChange={(v) => pushParams({ status: v })}
          options={[
            { value: "ATIVO", label: "Ativos" },
            { value: "INATIVO", label: "Inativos" },
            { value: "", label: "Todos" },
          ]}
        />
      </div>
    </div>
  );
}

function SegmentedControl({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-border">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-medium ${
            value === opt.value
              ? "bg-accent text-accent-foreground"
              : "bg-surface text-muted"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
