"use client";

import { useState } from "react";

export interface PrintOption {
  /** Casa com `data-print-section="id"` nos blocos da página. */
  id: string;
  label: string;
  /** Marcada na primeira vez (depois vale a última escolha). */
  defaultOn: boolean;
  /** Texto só da oficina: nunca vem marcado e mostra aviso quando marcado. */
  internal?: boolean;
}

function readSaved(storageKey: string): Record<string, boolean> | null {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : null;
  } catch {
    return null;
  }
}

function initialChoice(storageKey: string, options: PrintOption[]): Record<string, boolean> {
  const saved = readSaved(storageKey);
  const out: Record<string, boolean> = {};
  for (const o of options) {
    // Conteúdo interno nunca é lembrado como "marcado": cada impressão exige marcar de novo.
    out[o.id] = o.internal ? false : (saved?.[o.id] ?? o.defaultOn);
  }
  return out;
}

/**
 * "Imprimir" com painel de caixinhas: escolhe o que entra no papel antes de abrir a impressão.
 * Os blocos da página levam `data-print-section="id"`; aqui só se esconde (ou mostra, no caso de
 * conteúdo interno) o que foi marcado, apenas durante a impressão. Lembra a última escolha de cada documento.
 */
export function PrintPanelButton({
  docKey,
  options,
  label = "Imprimir",
}: {
  docKey: string;
  options: PrintOption[];
  label?: string;
}) {
  const storageKey = `print-panel:${docKey}`;
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<Record<string, boolean>>({});

  function openPanel() {
    setChoice(initialChoice(storageKey, options));
    setOpen(true);
  }

  function print() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(choice));
    } catch {
      // sem memória do navegador: segue sem lembrar
    }
    const rules = options
      .map((o) => {
        const on = choice[o.id];
        if (o.internal) return on ? `[data-print-section="${o.id}"]{display:block !important;}` : "";
        return on ? "" : `[data-print-section="${o.id}"]{display:none !important;}`;
      })
      .filter(Boolean)
      .join("\n");
    const style = document.createElement("style");
    style.textContent = `@media print {\n${rules}\n}`;
    document.head.appendChild(style);
    const cleanup = () => {
      style.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    setOpen(false);
    // Dá tempo de o painel fechar antes de abrir a impressão.
    setTimeout(() => window.print(), 50);
  }

  const internalOn = options.some((o) => o.internal && choice[o.id]);

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        className="flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium hover:border-accent print:hidden"
      >
        {label}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center print:hidden" role="dialog" aria-modal="true">
          <div className="flex w-full max-w-md flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
            <div>
              <h2 className="text-base font-semibold">O que imprimir?</h2>
              <p className="text-xs text-muted">Marque o que entra no papel. Eu lembro da sua última escolha neste documento.</p>
            </div>
            <ul className="flex flex-col gap-1.5">
              {options.map((o) => (
                <li key={o.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={Boolean(choice[o.id])}
                      onChange={(e) => setChoice((c) => ({ ...c, [o.id]: e.target.checked }))}
                    />
                    <span>
                      {o.label}
                      {o.internal ? <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold">interno</span> : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {internalOn ? (
              <p className="rounded-lg bg-accent/15 p-3 text-xs font-medium">
                Atenção: você marcou conteúdo interno da oficina. Ele vai aparecer no papel que o cliente recebe.
              </p>
            ) : null}
            <div className="flex gap-2">
              <button type="button" onClick={print} className="h-10 flex-1 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground">
                Imprimir
              </button>
              <button type="button" onClick={() => setOpen(false)} className="h-10 rounded-xl border border-border px-4 text-sm font-medium">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
