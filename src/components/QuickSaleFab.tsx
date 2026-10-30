"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Botão fixo "+ Venda rápida": abre a Venda rápida de qualquer tela (o assistente fica do outro lado). */
export function QuickSaleFab() {
  const pathname = usePathname();
  if (pathname.startsWith("/dashboard/venda-rapida")) return null;
  return (
    <Link
      href="/dashboard/venda-rapida"
      className="fixed bottom-20 left-4 z-40 flex h-12 items-center rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-lg md:bottom-6 md:left-60 print:hidden"
    >
      + Venda rápida
    </Link>
  );
}
