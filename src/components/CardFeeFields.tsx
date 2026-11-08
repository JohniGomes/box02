"use client";

import { formatBRL, reaisToCents } from "@/lib/money";
import { cardFeeOfRow, type CardFeePatch, type CardFeeRow } from "@/lib/cardFee";

/**
 * Campos da taxa da maquininha e das parcelas para uma linha de pagamento no CARTÃO
 * (todos opcionais). Usado na tela de Recebimentos da OS e no atalho de serviço já
 * concluído e pago. `row.amount` é sempre o valor do serviço.
 */
export function CardFeeFields({
  row,
  onChange,
}: {
  row: CardFeeRow;
  onChange: (patch: CardFeePatch) => void;
}) {
  const net = reaisToCents(row.amount || "0");
  const fee = cardFeeOfRow(row);
  const small = "h-10 min-w-0 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent";
  return (
    <details className="rounded-xl border border-border bg-surface px-3 py-2" open={Boolean(row.rate || row.gross || row.installments)}>
      <summary className="cursor-pointer text-xs font-medium">Taxa da maquininha repassada ao cliente (opcional)</summary>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-0.5 text-[11px] text-muted">
          Taxa (%)
          <input value={row.rate} onChange={(e) => onChange({ rate: e.target.value })} inputMode="decimal" placeholder="6,69" className={small} />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] text-muted">
          Passou no cartão (R$)
          <input value={row.gross} onChange={(e) => onChange({ gross: e.target.value })} inputMode="decimal" placeholder="1.250,68" className={small} />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] text-muted">
          Parcelas
          <input value={row.installments} onChange={(e) => onChange({ installments: e.target.value })} inputMode="numeric" placeholder="4" className={small} />
        </label>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        {fee > 0
          ? `Taxa ${formatBRL(fee)} · o cliente passa ${formatBRL(net + fee)} no cartão · ${formatBRL(net)} é o valor do serviço (abate o saldo da OS).`
          : "Preencha a taxa % (ela incide sobre o valor passado no cartão) ou o valor passado no cartão. O campo de valor acima é sempre o valor do serviço."}
      </p>
    </details>
  );
}
