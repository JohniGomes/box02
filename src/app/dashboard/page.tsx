import { auth } from "@/auth";

export default async function DashboardHomePage() {
  const session = await auth();
  const firstName = (session?.user?.name ?? "").split(" ")[0];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">
          Olá{firstName ? `, ${firstName}` : ""}.
        </h1>
        <p className="text-sm text-muted">
          Login funcionando. Os módulos operacionais chegam nos próximos ciclos.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Ciclo 1 — Fundação</h2>
        <p className="mt-1 text-sm text-muted">
          Autenticação, usuários, papéis e auditoria estão no ar. Ainda não há
          clientes, veículos ou ordens de serviço cadastrados — isso entra no
          Ciclo 2 em diante, conforme o roadmap em DEV_PLAN.md.
        </p>
      </div>
    </div>
  );
}
