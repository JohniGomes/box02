"use client";

/** Dispara o diálogo de impressão nativo do navegador — o próprio
 * diálogo já oferece "Salvar como PDF" como destino, então não precisa
 * de geração de PDF no servidor (Puppeteer etc.) só para isto. */
export function PrintButton({ label = "Imprimir / Gerar PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium hover:border-accent print:hidden"
    >
      {label}
    </button>
  );
}
