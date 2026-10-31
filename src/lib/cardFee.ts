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
