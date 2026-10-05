import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { DashboardNav } from "@/components/DashboardNav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const userName = session.user.name ?? session.user.email ?? "Usuário";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface px-4 print:hidden">
        <div className="flex items-center gap-2">
          <div
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- emblema oficial (PNG de referência), não um ícone do design system */}
            <img src="/box02-mark.png" alt="" className="h-6 w-6 object-contain" />
          </div>
          <span className="text-sm font-semibold tracking-tight">BOX 02</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted sm:inline">{userName}</span>
          <SignOutButton />
        </div>
      </header>

      <div className="flex flex-1">
        {/* Navegação lateral — visível a partir de telas médias (uso administrativo/desktop) */}
        <nav
          aria-label="Navegação principal"
          className="hidden w-56 shrink-0 border-r border-border bg-surface p-4 md:block print:hidden"
        >
          <DashboardNav />
        </nav>

        <main className="flex-1 px-4 py-6 pb-24 md:pb-6 print:p-0">{children}</main>
      </div>

      {/* Navegação inferior — uso operacional em celular/tablet */}
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface md:hidden print:hidden"
      >
        <DashboardNav mobile />
      </nav>
    </div>
  );
}
