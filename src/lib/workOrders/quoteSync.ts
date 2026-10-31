/**
 * Sincronizar a OS com uma versão nova do orçamento: pareamento e comparação linha a linha.
 * Funções puras (sem banco), usadas no servidor (que revalida tudo) e na tela de comparação.
 *
 * Como a versão nova do orçamento não guarda de qual item veio cada um (editar um rascunho apaga e recria
 * os itens), o pareamento é por semelhança e a pessoa pode trocar o par de qualquer linha.
 */

export interface SyncOsItem {
  id: string;
  type: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  /** PLANEJADO | EXECUTADO (itens cancelados nem entram na comparação). */
  status: string;
  serviceId: string | null;
  partId: string | null;
}

export interface SyncQuoteItem {
  id: string;
  type: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  serviceId: string | null;
  partId: string | null;
}

/** Adicional que já existe na OS (para avisar de duplicidade com um item novo). */
export interface SyncAdditional {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

export interface SyncChanges {
  description?: { from: string; to: string };
  unitPrice?: { from: number; to: number };
  quantity?: { from: number; to: number };
}

export type SyncLine =
  | {
      kind: "PAIR";
      osItem: SyncOsItem;
      quoteItem: SyncQuoteItem;
      changes: SyncChanges;
      /** Nada mudou entre a OS e a versão nova. */
      same: boolean;
      /** Valor e quantidade não mudam em item já executado; só a descrição. */
      blockedNote?: string;
    }
  | { kind: "REMOVE"; osItem: SyncOsItem; canApply: boolean; blockedNote?: string }
  | { kind: "ADD"; quoteItem: SyncQuoteItem; duplicateOf?: SyncAdditional };

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set(["de", "do", "da", "dos", "das", "e", "o", "a", "os", "as", "com", "para", "por", "em", "no", "na"]);

/** Palavras sem plural simples ("cilindros" = "cilindro") e sem palavrinhas de ligação. */
function tokens(text: string): Set<string> {
  return new Set(
    normalizeText(text)
      .split(" ")
      .filter((t) => t.length > 1 && !STOP.has(t))
      .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t)),
  );
}

/** Semelhança entre dois textos (0 a 1): palavras em comum sobre palavras no total. */
export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common += 1;
  return common / (ta.size + tb.size - common);
}

/** Pareamento sugerido: osItemId → quoteItemId (um item do orçamento nunca pareia com duas linhas da OS). */
export function autoPair(osItems: SyncOsItem[], quoteItems: SyncQuoteItem[]): Record<string, string> {
  const pairs: Record<string, string> = {};
  const used = new Set<string>();
  const free = (o: SyncOsItem) => !(o.id in pairs);

  const pass = (match: (o: SyncOsItem, q: SyncQuoteItem) => boolean) => {
    for (const o of osItems) {
      if (!free(o)) continue;
      const q = quoteItems.find((x) => !used.has(x.id) && x.type === o.type && match(o, x));
      if (q) {
        pairs[o.id] = q.id;
        used.add(q.id);
      }
    }
  };

  // 1) Igual em tudo.
  pass(
    (o, q) =>
      normalizeText(o.description) === normalizeText(q.description) && o.quantity === q.quantity && o.unitPriceCents === q.unitPriceCents,
  );
  // 2) Mesmo texto (valor ou quantidade mudou).
  pass((o, q) => normalizeText(o.description) === normalizeText(q.description));
  // 3) Mesmo serviço ou peça do catálogo.
  pass((o, q) => (o.serviceId !== null && o.serviceId === q.serviceId) || (o.partId !== null && o.partId === q.partId));
  // 4) Texto parecido (a descrição foi corrigida).
  for (const o of osItems) {
    if (!free(o)) continue;
    let best: { q: SyncQuoteItem; score: number } | null = null;
    for (const q of quoteItems) {
      if (used.has(q.id) || q.type !== o.type) continue;
      const score = similarity(o.description, q.description);
      if (score >= 0.5 && (!best || score > best.score)) best = { q, score };
    }
    if (best) {
      pairs[o.id] = best.q.id;
      used.add(best.q.id);
    }
  }
  return pairs;
}

/** Item novo que parece um adicional que já existe na OS (mesmo valor e quantidade, ou texto bem parecido). */
export function findDuplicateAdditional(quoteItem: SyncQuoteItem, additionals: SyncAdditional[]): SyncAdditional | undefined {
  return additionals.find(
    (a) =>
      (a.totalCents > 0 && a.totalCents === quoteItem.totalCents && similarity(a.description, quoteItem.description) >= 0.2) ||
      similarity(a.description, quoteItem.description) >= 0.6,
  );
}

/** Compara a OS com a versão nova, dado o pareamento (osItemId → quoteItemId, ou null = sem par). */
export function computeSyncLines(
  osItems: SyncOsItem[],
  quoteItems: SyncQuoteItem[],
  pairs: Record<string, string | null>,
  additionals: SyncAdditional[] = [],
): SyncLine[] {
  const quoteById = new Map(quoteItems.map((q) => [q.id, q]));
  const usedQuote = new Set<string>();
  const lines: SyncLine[] = [];

  for (const o of osItems) {
    const qid = pairs[o.id];
    const q = qid ? quoteById.get(qid) : undefined;
    if (!q || usedQuote.has(q.id)) {
      lines.push({
        kind: "REMOVE",
        osItem: o,
        canApply: o.status === "PLANEJADO",
        blockedNote: o.status === "PLANEJADO" ? undefined : "Já foi executado: não dá para cancelar por aqui. Use \"Desfazer execução\" antes, se for o caso.",
      });
      continue;
    }
    usedQuote.add(q.id);
    const changes: SyncChanges = {};
    if (o.description.trim() !== q.description.trim()) changes.description = { from: o.description, to: q.description };
    if (o.unitPriceCents !== q.unitPriceCents) changes.unitPrice = { from: o.unitPriceCents, to: q.unitPriceCents };
    if (o.quantity !== q.quantity) changes.quantity = { from: o.quantity, to: q.quantity };
    const valueChanged = Boolean(changes.unitPrice || changes.quantity);
    lines.push({
      kind: "PAIR",
      osItem: o,
      quoteItem: q,
      changes,
      same: Object.keys(changes).length === 0,
      blockedNote:
        valueChanged && o.status !== "PLANEJADO"
          ? "Item já executado: valor e quantidade não mudam. Só a descrição pode ser atualizada."
          : undefined,
    });
  }

  for (const q of quoteItems) {
    if (usedQuote.has(q.id)) continue;
    lines.push({ kind: "ADD", quoteItem: q, duplicateOf: findDuplicateAdditional(q, additionals) });
  }
  return lines;
}

/** O que a aplicação faz com cada linha escolhida (usado pelo servidor e para o resumo na tela). */
export interface SyncApplyChoice {
  /** Pares escolhidos para atualizar: osItemId → quoteItemId. */
  updates: { osItemId: string; quoteItemId: string }[];
  /** Itens da OS (planejados) a cancelar, por não estarem mais no orçamento. */
  removals: string[];
  /** Itens do orçamento a acrescentar na OS como planejados. */
  additions: string[];
  /** Copiar desconto e acréscimo da versão nova. */
  syncAdjustments: boolean;
}
