import Link from "next/link";
import { DRAFT_KINDS, draftResumeHref, isDraftKind, listDraftsService } from "@/lib/drafts/service";
import { DiscardDraftButton } from "./DiscardDraftButton";

function ago(date: Date): string {
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return `há ${days} ${days === 1 ? "dia" : "dias"}`;
}

/**
 * "Continuar de onde parei": rascunhos salvos com "Salvar e continuar depois".
 * Só aparece quando existe algum — a tela Início continua limpa quando não há.
 */
export async function DraftsCard() {
  const drafts = await listDraftsService(6);
  if (drafts.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="mb-1 text-sm font-semibold">Continuar de onde parei</h2>
      <p className="mb-3 text-xs text-muted">Lançamentos que você deixou pela metade.</p>
      <ul className="flex flex-col gap-2">
        {drafts.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
            <Link href={draftResumeHref(d)} className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{d.title}</p>
              <p className="text-xs text-muted">
                {isDraftKind(d.kind) ? DRAFT_KINDS[d.kind].label : d.kind} · salvo {ago(d.updatedAt)}
              </p>
            </Link>
            <span className="text-xs font-semibold text-accent">Continuar →</span>
            <DiscardDraftButton draftId={d.id} />
          </li>
        ))}
      </ul>
    </section>
  );
}
