"use client";

import { useEffect } from "react";

/** Registra o service worker do PWA no primeiro carregamento do app. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Falha silenciosa: PWA é um extra, não deve quebrar a navegação normal.
      });
    }
  }, []);

  return null;
}
