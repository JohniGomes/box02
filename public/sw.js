// Service worker mínimo do Ciclo 1 — apenas torna o app instalável (PWA).
// Estratégia de cache offline completa fica para uma fase futura
// (ver riscos técnicos em DEV_PLAN.md sobre dependência de internet).
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Passthrough — sem cache neste ciclo.
});
