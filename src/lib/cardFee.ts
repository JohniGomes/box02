import { reaisToCents } from "@/lib/money";

/**
 * Conta da taxa da maquininha repassada ao cliente. A taxa incide sobre o valor PASSADO NO CARTÃO (bruto),
 * não sobre o serviço: bruto = líquido ÷ (1 − taxa). O líquido (valor do serviço) é o que a oficina recebe.
 * Funções puras, em centavos.
 */

/** Aceita "6,69", "6.69" ou "6,69%". Devolve null se não for um número entre 0 e 30. */
export function parseFeePercent(text: string | undefined | null): number | null {
  const cleaned = (text ?? "").replace("%", "").trim().replace(",", ".");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 && n <= 30 ? n : null;
}

/** Quanto o cliente passa no cartão para a oficina ficar com `netCents` depois da taxa. */
export function grossFromNet(netCents: number, percent: number): number {
  return Math.round(netCents / (1 - percent / 100));
}

/** Taxa em centavos para um líquido e uma porcentagem (taxa sobre o bruto). */
export function feeFromNet(netCents: number, percent: number): number {
  return grossFromNet(netCents, percent) - netCents;
}

/** Líquido (valor do serviço) a partir do que foi passado no cartão. */
export function netFromGross(grossCents: number, percent: number): number {
  return Math.round(grossCents * (1 - percent / 100));
}

/** Porcentagem efetiva da taxa sobre o bruto, com 2 casas (ex.: 6.69). */
export function effectivePercent(netCents: number, feeCents: number): number {
  const gross = netCents + feeCents;
  return gross > 0 ? Math.round((feeCents / gross) * 10000) / 100 : 0;
}

/**
 * Linha de pagamento de um formulário. `amount` é sempre o valor DO SERVIÇO (líquido);
 * `rate` (% da maquininha) e `gross` (valor total passado no cartão) são opcionais.
 */
export interface CardFeeRow {
  method: string;
  amount: string;
  rate: string;
  gross: string;
  installments: string;
}

const centsToReaisText = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

/** Taxa repassada (centavos) desta linha: pelo valor passado no cartão, ou pela % sobre o valor do serviço. */
export function cardFeeOfRow(row: CardFeeRow): number {
  if (row.method !== "CARTAO") return 0;
  const net = reaisToCents(row.amount || "0");
  const gross = reaisToCents(row.gross || "0");
  const rate = parseFeePercent(row.rate);
  if (gross > 0) return Math.max(0, gross - net);
  if (rate && rate > 0 && net > 0) return feeFromNet(net, rate);
  return 0;
}

/** Ao mexer na taxa ou no valor passado no cartão: se vierem os dois, o valor do serviço sai deles (bruto × (1 − taxa)). */
export type CardFeePatch = Partial<Pick<CardFeeRow, "rate" | "gross" | "installments">>;

export function applyCardFeePatch<T extends CardFeeRow>(row: T, patch: CardFeePatch): T {
  const next = { ...row, ...patch };
  const rate = parseFeePercent(next.rate);
  const gross = reaisToCents(next.gross || "0");
  if (("rate" in patch || "gross" in patch) && rate && rate > 0 && gross > 0) {
    next.amount = centsToReaisText(netFromGross(gross, rate));
  }
  return next;
}
