"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { label: "Início", href: "/dashboard" },
  { label: "Clientes", href: "/dashboard/clientes" },
  { label: "Veículos", href: "/dashboard/veiculos" },
  { label: "Orçamentos", href: "/dashboard/orcamentos" },
  { label: "OS", href: "/dashboard/os" },
  { label: "Configurações", href: "/dashboard/configuracoes" },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

export function DashboardNav({ mobile }: { mobile?: boolean }) {
  const pathname = usePathname();

  if (mobile) {
    return (
      <ul className="flex items-stretch justify-around">
        {ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={`flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                <span
                  aria-hidden
                  className={`h-2 w-2 rounded-full ${active ? "bg-accent" : "bg-transparent"}`}
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                active ? "bg-accent/15 text-foreground" : "text-muted hover:bg-background"
              }`}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
