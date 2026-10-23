import {
  createDraft,
  deleteDraft,
  deleteStaleDrafts,
  findDraftById,
  listDrafts,
  updateDraft,
  type DraftRecord,
} from "@/lib/db/repositories/drafts";
import { recordAuditLog } from "@/lib/db/repositories/auditLog";

/** Tipos de formulário que aceitam "Salvar e continuar depois", com a tela de retomada. */
export const DRAFT_KINDS = {
  QUOTE: { label: "Orçamento", href: "/dashboard/orcamentos/novo" },
  PURCHASE: { label: "Compra de peças", href: "/dashboard/estoque/compra" },
  WORK_ORDER: { label: "OS sem orçamento", href: "/dashboard/os/novo" },
  QUICK_SALE: { label: "Venda rápida", href: "/dashboard/venda-rapida" },
} as const;

export type DraftKind = keyof typeof DRAFT_KINDS;

const MAX_PAYLOAD_BYTES = 200_000;
const MAX_TITLE = 120;
/** Rascunhos esquecidos são apagados depois de tanto tempo. */
export const DRAFT_RETENTION_DAYS = 60;

export class DraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftError";
  }
}

export function isDraftKind(value: string): value is DraftKind {
  return Object.prototype.hasOwnProperty.call(DRAFT_KINDS, value);
}

export function draftResumeHref(draft: Pick<DraftRecord, "id" | "kind">): string {
  const base = isDraftKind(draft.kind) ? DRAFT_KINDS[draft.kind].href : "/dashboard";
  return `${base}?rascunho=${encodeURIComponent(draft.id)}`;
}

/** Cria o rascunho (sem id) ou atualiza o existente. Guarda só o que foi digitado. */
export async function saveDraftService(
  actorUserId: string,
  input: { id?: string; kind: string; title: string; payload: unknown },
): Promise<DraftRecord> {
  if (!isDraftKind(input.kind)) throw new DraftError("Tipo de rascunho inválido.");
  const title = (input.title ?? "").trim().slice(0, MAX_TITLE) || DRAFT_KINDS[input.kind].label;
  const size = Buffer.byteLength(JSON.stringify(input.payload ?? null), "utf8");
  if (size > MAX_PAYLOAD_BYTES) throw new DraftError("Rascunho grande demais para salvar.");

  if (input.id) {
    const existing = await findDraftById(input.id);
    if (!existing) throw new DraftError("Rascunho não encontrado (talvez já tenha sido descartado).");
    if (existing.kind !== input.kind) throw new DraftError("Este rascunho é de outro tipo de formulário.");
    const updated = await updateDraft(input.id, { title, payload: input.payload });
    if (!updated) throw new DraftError("Rascunho não encontrado.");
    return updated;
  }

  const created = await createDraft({ kind: input.kind, title, payload: input.payload, createdByUserId: actorUserId });
  await recordAuditLog({
    userId: actorUserId,
    action: "DRAFT_CREATED",
    entityType: "draft",
    entityId: created.id,
    metadata: { kind: created.kind },
  });
  return created;
}

export async function getDraftService(id: string): Promise<DraftRecord | null> {
  return findDraftById(id);
}

export async function listDraftsService(limit = 8): Promise<DraftRecord[]> {
  await deleteStaleDrafts(DRAFT_RETENTION_DAYS);
  return listDrafts(limit);
}

export async function deleteDraftService(id: string): Promise<void> {
  await deleteDraft(id);
}
