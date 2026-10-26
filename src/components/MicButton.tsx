"use client";

import { useRef, useState } from "react";
import { speechErrorMessage } from "@/lib/voice";

/** Reconhecimento de voz do navegador (Chrome/Android). Não é padrão em todos os navegadores. */
interface SpeechResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Botão de microfone: o navegador transcreve a fala (português do Brasil) e entrega o texto a
 * `onText`. Não usa nenhuma API paga nem envia áudio para o nosso servidor. Se o navegador não
 * tiver ditado por voz, o botão nem aparece e a pessoa digita normalmente.
 */
export function MicButton({ onText, disabled }: { onText: (spoken: string) => void; disabled?: boolean }) {
  // Este componente só aparece depois de o painel ser aberto no navegador, então ler `window` aqui é seguro.
  const [Ctor] = useState<SpeechRecognitionCtor | null>(() => getRecognitionCtor());
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  if (!Ctor) return null;

  function toggle() {
    setMessage(null);
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new (Ctor as SpeechRecognitionCtor)();
    recognition.lang = "pt-BR";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      let spoken = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) spoken += `${result[0].transcript} `;
      }
      if (spoken.trim()) onText(spoken);
    };
    recognition.onerror = (event) => {
      setMessage(speechErrorMessage(event.error));
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setMessage(speechErrorMessage("unknown"));
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        title={listening ? "Parar de ouvir" : "Ditar por voz"}
        aria-label={listening ? "Parar de ouvir" : "Ditar por voz"}
        className={`flex items-center gap-1 rounded-lg border px-3 py-2 text-sm disabled:opacity-40 ${
          listening ? "border-danger bg-danger/10 text-danger" : "border-border hover:bg-muted/10"
        }`}
      >
        {listening ? "⏹ Ouvindo…" : "🎤"}
      </button>
      {message ? <span className="max-w-[12rem] text-right text-[11px] text-danger">{message}</span> : null}
    </div>
  );
}
