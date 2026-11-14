/**
 * Agrupa os itens de um orçamento em blocos para MOSTRAR (tela e impressão):
 * o serviço com as suas peças e mão de obra, e o total do bloco em destaque.
 *
 * Não muda nenhum valor: o total do bloco é só a soma das linhas dele, e os
 * subtotais do orçamento continuam vindo da própria versão. Itens sem
 * `groupKey` ficam soltos, como antes.
 */
export interface BlockableItem {
  id: string;
  type: "SERVICO" | "PECA" | "MAO_DE_OBRA";
  totalCents: number;
  groupKey: string | null;
}

export type DisplayEntry<T extends BlockableItem> =
  | { kind: "single"; item: T }
  | { kind: "block"; key: string; head: T; children: T[]; totalCents: number };

export function groupItemsForDisplay<T extends BlockableItem>(items: T[]): DisplayEntry<T>[] {
  const entries: DisplayEntry<T>[] = [];
  const membersByKey = new Map<string, T[]>();
  for (const item of items) {
    if (!item.groupKey) continue;
    const list = membersByKey.get(item.groupKey) ?? [];
    list.push(item);
    membersByKey.set(item.groupKey, list);
  }

  const emitted = new Set<string>();
  for (const item of items) {
    if (!item.groupKey) {
      entries.push({ kind: "single", item });
      continue;
    }
    if (emitted.has(item.groupKey)) continue;
    emitted.add(item.groupKey);

    const members = membersByKey.get(item.groupKey) ?? [item];
    // Bloco de um item só (ex.: o filho foi apagado) vira item solto.
    if (members.length === 1) {
      entries.push({ kind: "single", item: members[0] });
      continue;
    }
    const head = members.find((m) => m.type === "SERVICO") ?? members[0];
    const children = members.filter((m) => m.id !== head.id);
    entries.push({
      kind: "block",
      key: item.groupKey,
      head,
      children,
      totalCents: members.reduce((sum, m) => sum + m.totalCents, 0),
    });
  }
  return entries;
}
