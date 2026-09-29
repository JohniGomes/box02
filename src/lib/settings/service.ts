import { getSetting, setSetting } from "@/lib/db/repositories/appSettings";

export const QUOTE_DEFAULT_VALIDITY_DAYS_KEY = "quote_default_validity_days";
/** Usado apenas se a linha não existir no banco por algum motivo — nunca
 * deveria acontecer em produção (o seed/migração já grava o valor), mas
 * evita que o sistema quebre em vez de degradar de forma previsível. */
const FALLBACK_VALIDITY_DAYS = 7;

export async function getQuoteDefaultValidityDays(): Promise<number> {
  const raw = await getSetting(QUOTE_DEFAULT_VALIDITY_DAYS_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : FALLBACK_VALIDITY_DAYS;
}

export async function setQuoteDefaultValidityDays(days: number): Promise<void> {
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error("Validade padrão precisa ser um número de dias maior que zero.");
  }
  await setSetting(QUOTE_DEFAULT_VALIDITY_DAYS_KEY, String(Math.round(days)));
}

// ============================================================
// Ciclo H — Precificação e Custos
// ============================================================

export const PRICING_DEFAULT_MARKUP_PERCENT_KEY = "pricing_default_markup_percent";

/**
 * Diferente de `getQuoteDefaultValidityDays`, esta função NÃO tem
 * fallback numérico — decisão explícita (H4-D4): o sistema nasce sem
 * markup configurado, e nenhum percentual é inventado nem semeado em
 * migração. `null` significa genuinamente "ainda não configurado" —
 * todo consumidor deste valor precisa tratar `null` explicitamente
 * (nunca assumir um número na ausência de configuração).
 */
export async function getDefaultMarkupPercent(): Promise<number | null> {
  const raw = await getSetting(PRICING_DEFAULT_MARKUP_PERCENT_KEY);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function setDefaultMarkupPercent(percent: number): Promise<void> {
  if (!Number.isFinite(percent) || percent < 0) {
    throw new Error("Markup padrão precisa ser um número maior ou igual a zero.");
  }
  await setSetting(PRICING_DEFAULT_MARKUP_PERCENT_KEY, String(percent));
}

// ============================================================
// Ciclo O — CRM (histórico consolidado + lembrete de retorno)
// ============================================================

export const CRM_REENGAGEMENT_THRESHOLD_DAYS_KEY = "crm_reengagement_threshold_days";

/**
 * Mesmo padrão do markup padrão (Ciclo H, DEC H4-D4): SEM fallback
 * numérico. O sistema não inventa um limite de dias (ex.: 180) — até
 * os sócios configurarem, `null` significa genuinamente "ainda não
 * configurado", e a lista de lembrete de retorno não calcula nada.
 */
export async function getReengagementThresholdDays(): Promise<number | null> {
  const raw = await getSetting(CRM_REENGAGEMENT_THRESHOLD_DAYS_KEY);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function setReengagementThresholdDays(days: number): Promise<void> {
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error("O limite de dias precisa ser um número maior que zero.");
  }
  await setSetting(CRM_REENGAGEMENT_THRESHOLD_DAYS_KEY, String(Math.round(days)));
}
