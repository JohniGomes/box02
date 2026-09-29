"use client";

import { useState, type ReactNode } from "react";

/**
 * Wrapper puramente visual — nunca esconde dado nenhum, só reduz a
 * rolagem inicial em OS longas (UX-4). Não toca no conteúdo interno de
 * nenhum componente já existente, só envolve por fora.
 */
export function CollapsibleSection({
  title,
  defaultOpen = true,
  badge,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          {title}
          {badge}
        </span>
        <span className="text-muted">{open ? "−" : "+"}</span>
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}
