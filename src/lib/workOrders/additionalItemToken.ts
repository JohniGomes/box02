import { randomBytes } from "node:crypto";

/**
 * Token de acesso ao item adicional — mesma técnica já usada no orçamento
 * (`src/lib/quotes/token.ts`): 32 bytes de entropia via `crypto.randomBytes`,
 * nunca sequencial. AD-2: um item, um token — nunca compartilhado entre
 * vários adicionais.
 */
export function generateAdditionalItemAccessToken(): string {
  return randomBytes(32).toString("hex");
}

/** AD-3: validade fixa de 48 horas, não configurável (diferente do
 * orçamento) — o carro já está parado na oficina aguardando resposta. */
export const ADDITIONAL_ITEM_LINK_VALIDITY_HOURS = 48;

export function computeAdditionalItemExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + ADDITIONAL_ITEM_LINK_VALIDITY_HOURS * 60 * 60 * 1000);
}
