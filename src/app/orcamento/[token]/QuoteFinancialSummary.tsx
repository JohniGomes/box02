import { formatBRL } from "@/lib/money";

export function QuoteFinancialSummary({
  subtotalServicesCents,
  subtotalPartsCents,
  subtotalLaborCents,
  discountTotalCents,
  surchargeTotalCents,
  totalCents,
  informativeEstimatedCents,
}: {
  subtotalServicesCents: number;
  subtotalPartsCents: number;
  subtotalLaborCents: number;
  discountTotalCents: number;
  surchargeTotalCents: number;
  totalCents: number;
  /** Ciclo C1: soma dos itens INFORMATIVO — nunca somada ao total abaixo,
   * mostrada separadamente com rótulo explícito. */
  informativeEstimatedCents?: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
      <h2 className="mb-2 text-sm font-semibold">Resumo do orçamento</h2>
      <div className="flex flex-col gap-1.5">
        {subtotalServicesCents > 0 ? <Row label="Serviços" value={formatBRL(subtotalServicesCents)} /> : null}
        {subtotalPartsCents > 0 ? <Row label="Peças" value={formatBRL(subtotalPartsCents)} /> : null}
        {subtotalLaborCents > 0 ? <Row label="Mão de obra" value={formatBRL(subtotalLaborCents)} /> : null}
        {discountTotalCents > 0 ? <Row label="Desconto" value={`- ${formatBRL(discountTotalCents)}`} /> : null}
        {surchargeTotalCents > 0 ? <Row label="Acréscimo" value={`+ ${formatBRL(surchargeTotalCents)}`} /> : null}
      </div>
      <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-semibold">
        <span>Total do orçamento (cobrável)</span>
        <span>{formatBRL(totalCents)}</span>
      </div>
      {informativeEstimatedCents && informativeEstimatedCents > 0 ? (
        <p className="mt-2 text-xs text-muted">
          + {formatBRL(informativeEstimatedCents)} em itens informativos (valor estimado, não cobrado, não incluso no total acima)
        </p>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted">
      <span>{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
