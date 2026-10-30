/**
 * Funções puras do seletor "quem executou" — sem banco, para poderem ser usadas
 * tanto no servidor quanto nas telas do navegador.
 *
 * Nos seletores da OS o valor de cada opção é `executor:<id>` para os nomes da
 * lista de executores e o id puro para usuários (usos antigos).
 */
export const EXECUTOR_VALUE_PREFIX = "executor:";

export interface ExecutorOption {
  /** Valor do seletor (ver EXECUTOR_VALUE_PREFIX). */
  id: string;
  name: string;
}

/** Quando duas ou mais pessoas executam juntas, o valor do seletor é a lista dos marcados separada por vírgula. */
export function executorTokens(value: string): string[] {
  return (value ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Traduz o valor escolhido no seletor para o que os serviços de OS esperam. */
export function parseExecutorValue(value: string): { executorId?: string; executedByUserId?: string; executorIds?: string[] } {
  const tokens = executorTokens(value);
  if (tokens.length > 1) {
    return { executorIds: tokens.map((t) => (t.startsWith(EXECUTOR_VALUE_PREFIX) ? t.slice(EXECUTOR_VALUE_PREFIX.length) : t)) };
  }
  const v = tokens[0] ?? "";
  if (v.startsWith(EXECUTOR_VALUE_PREFIX)) return { executorId: v.slice(EXECUTOR_VALUE_PREFIX.length) };
  return { executedByUserId: v };
}

/** "A", "A e B", "A, B e C". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

/** Marca ou desmarca uma opção, mantendo a ordem da lista e nunca deixando a seleção vazia. */
export function toggleExecutorValue(value: string, id: string, options: ExecutorOption[]): string {
  const selected = new Set(executorTokens(value));
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  if (selected.size === 0) return value;
  return options.filter((o) => selected.has(o.id)).map((o) => o.id).join(",");
}

/** Só deixa passar opções que ainda existem; se sobrar nada, usa o padrão. */
export function sanitizeExecutorValue(value: string, options: ExecutorOption[], fallback: string): string {
  const valid = executorTokens(value).filter((t) => options.some((o) => o.id === t));
  return valid.length > 0 ? valid.join(",") : fallback;
}

/** Opções cujo nome aparece em "A e B" / "A, B e C" (para pré-marcar ao corrigir um item). */
export function selectedFromNames(options: ExecutorOption[], text: string | null | undefined): string {
  const wanted = (text ?? "")
    .split(/,| e /)
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean);
  return options
    .filter((o) => wanted.includes(o.name.trim().toLowerCase()))
    .map((o) => o.id)
    .join(",");
}

/** Opção inicial de um seletor: a do usuário logado se existir na lista, senão a primeira. */
export function defaultExecutorOptionId(options: ExecutorOption[], currentUserId: string): string {
  return options.some((o) => o.id === currentUserId) ? currentUserId : (options[0]?.id ?? "");
}
