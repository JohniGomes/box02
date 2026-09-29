import Link from "next/link";
import { NewChecklistForm } from "../NewChecklistForm";

export default function NewChecklistPage() {
  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/configuracoes/checklists" className="text-sm text-muted hover:underline">
        ← Checklists
      </Link>
      <h1 className="text-lg font-semibold tracking-tight">Novo checklist</h1>
      <NewChecklistForm />
    </div>
  );
}
