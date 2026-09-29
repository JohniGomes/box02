import Link from "next/link";

const ITEMS = [
  { label: "Serviços", href: "/dashboard/configuracoes/servicos" },
  { label: "Checklists", href: "/dashboard/configuracoes/checklists" },
  { label: "Procedimentos", href: "/dashboard/configuracoes/procedimentos" },
  { label: "Precificação", href: "/dashboard/configuracoes/precificacao" },
];

export default function ConfiguracoesPage() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold tracking-tight">Configurações</h1>
      <ul className="flex flex-col gap-3">
        {ITEMS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="flex h-14 items-center justify-between rounded-2xl border border-border bg-surface px-4 text-sm font-semibold"
            >
              {item.label}
              <span className="text-muted">→</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-2 border-t border-border pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Área interna</p>
        <Link
          href="/dashboard/painel-projeto"
          className="flex h-14 items-center justify-between rounded-2xl border border-accent/30 bg-accent/5 px-4 text-sm font-semibold text-accent"
        >
          Painel do Projeto BOX 02
          <span>→</span>
        </Link>
      </div>
    </div>
  );
}
