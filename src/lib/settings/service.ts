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
// Regras da oficina (travas que podem ser ligadas/desligadas)
// ============================================================

export const RECEPTION_REQUIRED_KEY = "rule_reception_required_for_execution";

/**
 * A OS só passa para "Em execução" com o Termo de Recepção aceito?
 * Padrão: SIM (comportamento original do sistema). Só vira "não" se alguém
 * desligar em Configurações → Regras. Quando desligado, o termo continua
 * existindo e aparece como pendência ("Aceite pendente"), só não trava.
 */
export async function isReceptionRequiredForExecution(): Promise<boolean> {
  const raw = await getSetting(RECEPTION_REQUIRED_KEY);
  return raw !== "false";
}

export async function setReceptionRequiredForExecution(required: boolean): Promise<void> {
  await setSetting(RECEPTION_REQUIRED_KEY, required ? "true" : "false");
}

export const DELIVERY_CHECKLIST_REQUIRED_KEY = "rule_delivery_checklist_required";

/**
 * A OS só pode ser entregue com os itens obrigatórios do checklist de entrega
 * marcados (quando esse checklist foi iniciado)? Padrão: SIM. Desligada, a OS
 * pode ser entregue e a pendência aparece em "Pendências das OS" no Início.
 */
export async function isDeliveryChecklistRequired(): Promise<boolean> {
  const raw = await getSetting(DELIVERY_CHECKLIST_REQUIRED_KEY);
  return raw !== "false";
}

export async function setDeliveryChecklistRequired(required: boolean): Promise<void> {
  await setSetting(DELIVERY_CHECKLIST_REQUIRED_KEY, required ? "true" : "false");
}

export const DETAILED_STAGES_KEY = "rule_detailed_stages";

/**
 * A OS usa todas as etapas (diagnóstico, aguardando peça, teste final, pronta)?
 * Padrão: NÃO (modo simples: Aberta → Em execução → Entregue, e dá para entregar de qualquer etapa
 * aberta). Ligado, vale o fluxo completo de antes, para quando houver mais gente na oficina.
 */
export async function isDetailedStagesEnabled(): Promise<boolean> {
  const raw = await getSetting(DETAILED_STAGES_KEY);
  return raw === "true";
}

export async function setDetailedStagesEnabled(enabled: boolean): Promise<void> {
  await setSetting(DETAILED_STAGES_KEY, enabled ? "true" : "false");
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
// Taxa do cartão (maquininha)
// ============================================================

export const CARD_FEE_PERCENT_KEY = "card_fee_percent";
/** Taxa informada pelos donos em 2026-10-30 (vale para débito e crédito até dizerem o contrário). */
export const DEFAULT_CARD_FEE_PERCENT = 6.83;

export async function getCardFeePercent(): Promise<number> {
  const raw = await getSetting(CARD_FEE_PERCENT_KEY);
  const parsed = raw === null ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 30 ? parsed : DEFAULT_CARD_FEE_PERCENT;
}

export async function setCardFeePercent(percent: number): Promise<void> {
  if (!Number.isFinite(percent) || percent < 0 || percent > 30) {
    throw new Error("A taxa do cartão precisa ser um número entre 0 e 30.");
  }
  await setSetting(CARD_FEE_PERCENT_KEY, String(percent));
}
