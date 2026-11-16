"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Telas de formulário e de conferência: o botão flutuante cobria campos e títulos
 * (ex.: "Data da compra"), então nelas ele some. A Venda rápida continua no atalho
 * da tela inicial e nas telas de lista.
 */
const HIDE_ON = /\/(venda-rapida|novo|nova|editar|compra|ficha|recibo|detalhes|recepcao|termo|checklist)(\/|$)/;

/** Botão fixo "+ Venda rápida": abre a Venda rápida de qualquer tela (o assistente fica do outro lado). */
export function QuickSaleFab() {
  const pathname = usePathname();
  if (HIDE_ON.test(pathname)) return null;
  return (
    <Link
      href="/dashboard/venda-rapida"
      aria-label="Venda rápida"
      title="Venda rápida"
      className="fixed bottom-20 left-3 z-40 flex h-10 items-center rounded-full bg-accent px-3 text-xs font-semibold text-accent-foreground opacity-90 shadow-lg hover:opacity-100 md:bottom-6 md:left-60 print:hidden"
    >
      + Venda rápida
    </Link>
  );
}
