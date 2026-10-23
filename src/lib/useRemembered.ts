"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Valor escolhido que o navegador lembra (ex.: o último executor, a última
 * forma de pagamento). Começa no padrão e, ao montar, usa o último valor
 * salvo — se ele ainda for uma opção válida. Tudo em try/catch: se o
 * navegador bloquear o armazenamento, simplesmente usa o padrão.
 */
export function useRememberedChoice(
  key: string,
  fallback: string,
  allowed?: string[],
): [string, (value: string) => void] {
  const [value, setValue] = useState(fallback);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved && (!allowed || allowed.includes(saved))) setValue(saved);
    } catch {
      /* sem armazenamento: usa o padrão */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: string) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        /* ignora */
      }
    },
    [key],
  );

  return [value, update];
}
