import { randomBytes } from "node:crypto";

/**
 * Token de acesso ao orçamento — é a ÚNICA credencial exigida no link
 * público (D2: sem login). Tratado como segredo: 32 bytes de entropia
 * (256 bits) via `crypto.randomBytes`, nunca `Math.random()` nem valor
 * sequencial/previsível. Codificado em hex (64 caracteres), seguro para
 * ir direto na URL.
 */
export function generateQuoteAccessToken(): string {
  return randomBytes(32).toString("hex");
}
