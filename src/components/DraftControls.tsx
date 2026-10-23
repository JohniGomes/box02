"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deleteDraftAction, getDraftAction, saveDraftAction } from "@/app/dashboard/rascunhos/actions";

export interface DraftState {
  draftId: string | null;
  saving: boolean;
  savedAt: Date | null;
  loadedFromDraft: boolean;
  error: string | null;
  save: () => Promise<void>;
  /** Chame depois de gravar de verdade o formulário: apaga o rascunho. */
  finish: () => Promise<void>;
  discard: () => Promise<void>;
}

/**
 * "Salvar e continuar depois" para um formulário longo.
 * - `getPayload` devolve só o que foi digitado (JSON simples).
 * - `applyPayload` recoloca esse conteúdo no formulário (chamado uma vez, quando a
 *   página abre com `?rascunho=ID`).
 * O rascunho nunca mexe em estoque nem em dinheiro: é só texto guardado.
 */
export function useDraft<T>({
  kind,
  getTitle,
  getPayload,
  applyPayload,
}: {
  kind: string;
  getTitle: () => string;
  getPayload: () => T;
  applyPayload: (payload: T) => void;
}): DraftState {
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [loadedFromDraft, setLoadedFromDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const applyRef = useRef(applyPayload);
  const getPayloadRef = useRef(getPayload);
  const getTitleRef = useRef(getTitle);
  const loadedRef = useRef(false);

  useEffect(() => {
    applyRef.current = applyPayload;
    getPayloadRef.current = getPayload;
    getTitleRef.current = getTitle;
  });

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    let id: string | null = null;
    try {
      id = new URLSearchParams(window.location.search).get("rascunho");
    } catch {
      id = null;
    }
    if (!id) return;
    getDraftAction(id).then((draft) => {
      if (draft && draft.kind === kind) {
        applyRef.current(draft.payload as T);
        setDraftId(draft.id);
        setLoadedFromDraft(true);
      } else {
        setError("Rascunho não encontrado (talvez já tenha sido descartado).");
      }
    });
  }, [kind]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    const result = await saveDraftAction({
      id: draftId ?? undefined,
      kind,
      title: getTitleRef.current(),
      payload: getPayloadRef.current(),
    });
    setSaving(false);
    if (!result.success || !result.id) {
      setError(result.error ?? "Não foi possível salvar o rascunho.");
      return;
    }
    setDraftId(result.id);
    setSavedAt(result.savedAt ? new Date(result.savedAt) : new Date());
    // Deixa o endereço com o rascunho, para recarregar a página sem perder nada.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("rascunho", result.id);
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* ignora */
    }
  }, [draftId, kind]);

  const finish = useCallback(async () => {
    if (draftId) await deleteDraftAction(draftId);
  }, [draftId]);

  const discard = useCallback(async () => {
    if (draftId) await deleteDraftAction(draftId);
    setDraftId(null);
    setSavedAt(null);
    setLoadedFromDraft(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("rascunho");
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* ignora */
    }
  }, [draftId]);

  return { draftId, saving, savedAt, loadedFromDraft, error, save, finish, discard };
}

/** Botão "Salvar e continuar depois" + situação do rascunho. */
export function DraftBar({ draft }: { draft: DraftState }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-dashed border-border p-3 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void draft.save()}
          disabled={draft.saving}
          className="h-10 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-60"
        >
          {draft.saving ? "Salvando…" : "Salvar e continuar depois"}
        </button>
        {draft.draftId ? (
          <button type="button" onClick={() => void draft.discard()} className="text-xs font-medium text-danger underline">
            Descartar rascunho
          </button>
        ) : null}
      </div>
      {draft.loadedFromDraft && !draft.savedAt ? (
        <p className="text-xs text-muted">Rascunho carregado — continue de onde parou.</p>
      ) : null}
      {draft.savedAt ? (
        <p className="text-xs text-success">
          Rascunho salvo às {draft.savedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Você
          encontra em &quot;Continuar de onde parei&quot; na tela Início.
        </p>
      ) : null}
      {draft.error ? <p className="text-xs text-danger">{draft.error}</p> : null}
    </div>
  );
}
