"use client";

import { executorTokens, joinNames, toggleExecutorValue, type ExecutorOption } from "@/lib/executors/value";

/**
 * "Executado por" com caixinhas: marque um ou mais (quando trabalham juntos).
 * O valor é a lista dos marcados separada por vírgula; sempre fica pelo menos um marcado.
 */
export function ExecutorPicker({
  options,
  value,
  onChange,
}: {
  options: ExecutorOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = new Set(executorTokens(value));
  const selectedNames = options.filter((o) => selected.has(o.id)).map((o) => o.name);

  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-[11px] font-medium text-muted">Executado por</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.has(o.id);
          return (
            <label
              key={o.id}
              className={`flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-medium ${
                on ? "border-accent bg-accent/15" : "border-border text-muted"
              }`}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => onChange(toggleExecutorValue(value, o.id, options))}
                className="h-4 w-4"
              />
              {o.name}
            </label>
          );
        })}
      </div>
      {selectedNames.length > 1 ? <p className="text-[11px] text-muted">Vai aparecer como: {joinNames(selectedNames)}</p> : null}
    </fieldset>
  );
}
