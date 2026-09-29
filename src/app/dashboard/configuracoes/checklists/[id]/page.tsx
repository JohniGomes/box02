import Link from "next/link";
import { notFound } from "next/navigation";
import { getChecklistService } from "@/lib/checklists/checklistService";
import { ChecklistItemsManager } from "./ChecklistItemsManager";
import { ChecklistStatusToggle } from "./ChecklistStatusToggle";

const TYPE_LABEL: Record<string, string> = { ENTRADA: "Entrada", EXECUCAO: "Execução", ENTREGA: "Entrega" };

export default async function ChecklistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getChecklistService(id);
  if (!result) notFound();
  const { checklist, items } = result;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/configuracoes/checklists" className="text-sm text-muted hover:underline">
        ← Checklists
      </Link>

      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold tracking-tight">{checklist.code} — {checklist.name}</h1>
      </div>
      <div className="flex gap-2">
        <span className="w-fit rounded-full bg-muted/20 px-2 py-0.5 text-[11px] font-semibold text-muted">
          {TYPE_LABEL[checklist.type]}
        </span>
        <span
          className={`w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            checklist.status === "ATIVO" ? "bg-success/15 text-success" : "bg-muted/20 text-muted"
          }`}
        >
          {checklist.status === "ATIVO" ? "Ativo" : "Inativo"}
        </span>
      </div>

      <ChecklistItemsManager checklistId={checklist.id} items={items} />

      <ChecklistStatusToggle checklistId={checklist.id} status={checklist.status} />
    </div>
  );
}
