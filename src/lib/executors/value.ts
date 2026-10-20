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

/** Traduz o valor escolhido no seletor para o que os serviços de OS esperam. */
export function parseExecutorValue(value: string): { executorId?: string; executedByUserId?: string } {
  const v = (value ?? "").trim();
  if (v.startsWith(EXECUTOR_VALUE_PREFIX)) return { executorId: v.slice(EXECUTOR_VALUE_PREFIX.length) };
  return { executedByUserId: v };
}

/** Opção inicial de um seletor: a do usuário logado se existir na lista, senão a primeira. */
export function defaultExecutorOptionId(options: ExecutorOption[], currentUserId: string): string {
  return options.some((o) => o.id === currentUserId) ? currentUserId : (options[0]?.id ?? "");
}
