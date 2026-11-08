import { cardFeeOfRow, type CardFeeRow } from "@/lib/cardFee";
import { reaisToCents } from "@/lib/money";

export interface CompletedServicePaymentPayload {
  method: string;
  amountReais: string;
  /** Taxa da maquininha repassada ao cliente (valor à parte; só cartão). */
  cardFeeReais?: string;
  installments?: string;
}

const toReais = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

/**
 * Transforma as linhas de pagamento da tela de "serviço já concluído e pago" no que o
 * servidor espera. Linhas com valor zero/vazio são ignoradas (valor parcial ou nenhum
 * pagamento são permitidos: o resto fica em "A receber"). A taxa sai da % ou do valor
 * total passado no cartão, e parcelas e taxa só vão para linhas de cartão.
 */
export function buildCompletedServicePayments(rows: CardFeeRow[]): CompletedServicePaymentPayload[] {
  return rows
    .filter((r) => reaisToCents(r.amount || "0") > 0)
    .map((r) => {
      const fee = cardFeeOfRow(r);
      const isCard = r.method === "CARTAO";
      const payload: CompletedServicePaymentPayload = { method: r.method, amountReais: r.amount };
      if (fee > 0) payload.cardFeeReais = toReais(fee);
      if (isCard && r.installments.trim()) payload.installments = r.installments.trim();
      return payload;
    });
}
