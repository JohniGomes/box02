/** Mensagem única que a pessoa vê quando a IA está fora do ar (sem detalhe técnico). */
export const GEMINI_FRIENDLY_MESSAGE = "O assistente está indisponível agora. Lance manualmente.";

export type GeminiUnavailableReason = "no_key" | "request_failed" | "model_missing";

/** A IA não pôde ser usada (sem chave, sem modelo, rede, cota…). O motivo técnico vai só para o log. */
export class GeminiUnavailableError extends Error {
  constructor(
    public readonly reason: GeminiUnavailableReason,
    public readonly cause?: unknown,
  ) {
    super(GEMINI_FRIENDLY_MESSAGE);
    this.name = "GeminiUnavailableError";
  }
}

/** A IA respondeu, mas não no formato esperado. */
export class GeminiBadResponseError extends Error {
  constructor() {
    super("O assistente não entendeu o texto desta vez. Tente de novo ou lance manualmente.");
    this.name = "GeminiBadResponseError";
  }
}

/** Texto seguro para mostrar à pessoa a partir de qualquer erro da IA. */
export function friendlyAiMessage(err: unknown): string {
  if (err instanceof GeminiUnavailableError || err instanceof GeminiBadResponseError) return err.message;
  return GEMINI_FRIENDLY_MESSAGE;
}
