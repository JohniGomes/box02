/** Junta o que foi ditado ao texto que já estava na caixa (com um espaço entre os dois). */
export function appendTranscript(previous: string, spoken: string): string {
  const add = spoken.trim();
  if (!add) return previous;
  const base = previous.trimEnd();
  return base ? `${base} ${add}` : add;
}

/** Mensagem amigável para os erros do reconhecimento de voz do navegador. */
export function speechErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "O microfone está bloqueado. Permita o microfone para este site no navegador.";
    case "no-speech":
      return "Não ouvi nada. Toque no microfone e fale de novo.";
    case "audio-capture":
      return "Não encontrei um microfone neste aparelho.";
    case "network":
      return "Sem internet para o ditado agora. Digite o texto.";
    default:
      return "Não consegui usar o ditado por voz agora. Digite o texto.";
  }
}
