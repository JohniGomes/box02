/** Cabeçalho visual que imita o modelo em papel (barra preta + faixa
 * vermelha) — usado nas telas dedicadas de Checklist e Termo de
 * Recepção, pra ficar "igual ao PDF" por pedido explícito. */
export function PdfStyleHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <div className="flex items-center justify-between bg-foreground px-5 py-4">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- emblema oficial, não ícone do design system */}
          <img src="/box02-mark.png" alt="" className="h-8 w-8 object-contain" />
          <span className="text-base font-extrabold tracking-tight text-white">
            BOX <span className="text-accent">02</span>
          </span>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold uppercase tracking-wide text-white">{title}</p>
          <p className="text-xs text-white/70">{subtitle}</p>
        </div>
      </div>
      <div className="h-1.5 bg-accent" />
    </div>
  );
}
